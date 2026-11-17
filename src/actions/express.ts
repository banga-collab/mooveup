"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getScope } from "@/lib/auth";
import { entity } from "@/lib/entities";
import { PAY_LABEL, agadirToIso, fmtDate, fmtTime, mad } from "@/lib/utils";
import type { CatalogItem, Contact, PayMethod, Profile } from "@/lib/types";
import type { ExpressInput } from "@/lib/types-agenda";
import { formatPhone, phoneDigits } from "@/components/contacts/helpers";
import { flash } from "@/lib/flash";
import { createSale } from "./sales";

export type ExpressResult = { error?: string; duplicate?: { id: string; full_name: string; phone: string | null } } | undefined;

const METHODS = Object.keys(PAY_LABEL) as PayMethod[];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** URL d'une redirection Next (`redirect()` lève une erreur spéciale) */
function redirectTarget(e: unknown) {
  const d = (e as { digest?: unknown } | null)?.digest;
  if (typeof d !== "string" || !d.startsWith("NEXT_REDIRECT")) return null;
  return d.split(";")[2] ?? null;
}

/**
 * Accueil express : en une seule validation, crée le client si besoin,
 * le rendez-vous (ou l'abonnement / les produits via la vente), la vente et l'historique.
 */
export async function expressCheckout(input: ExpressInput): Promise<ExpressResult> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const allowed = scope.allowed.map((e) => e.id);

  /* ---------- Contrôles ---------- */
  if (!allowed.includes(input.entity_id)) return { error: "Choisissez un établissement autorisé." };
  if (!METHODS.includes(input.method)) return { error: "Choisissez le mode de paiement." };
  const rawLines = (input.lines ?? []).map((l) => ({ item_id: String(l.item_id), qty: Math.round(Number(l.qty)) })).filter((l) => l.item_id && l.qty > 0 && l.qty <= 99);
  if (!rawLines.length) return { error: input.mode === "rdv" ? "Choisissez la prestation." : input.mode === "abonnement" ? "Choisissez l'abonnement." : "Ajoutez au moins un produit." };
  if (input.mode !== "produit" && rawLines.length > 1) return { error: "Une seule prestation ou un seul abonnement à la fois." };

  const { data: itemRows } = await supabase.from("catalog_items").select("*").in("id", [...new Set(rawLines.map((l) => l.item_id))]);
  const items = new Map(((itemRows ?? []) as CatalogItem[]).map((i) => [i.id, i]));
  const kinds = input.mode === "rdv" ? ["prestation", "pack"] : input.mode === "abonnement" ? ["abonnement", "pack"] : ["produit"];
  for (const l of rawLines) {
    const it = items.get(l.item_id);
    if (!it || it.entity_id !== input.entity_id || !it.active) return { error: "Un article n'est pas proposé par cet établissement : actualisez la page." };
    if (!kinds.includes(it.kind)) return { error: `« ${it.name} » ne correspond pas au choix (${input.mode === "rdv" ? "rendez-vous" : input.mode}).` };
    if (it.kind === "produit" && it.stock !== null && Number(it.stock) < l.qty) return { error: `Stock insuffisant pour « ${it.name} » (${it.stock} en stock).` };
  }
  const lines = rawLines.map((l) => {
    const it = items.get(l.item_id)!;
    return { item: it, qty: input.mode === "produit" ? l.qty : 1 };
  });
  const total = round2(lines.reduce((s, l) => s + Number(l.item.price_mad) * l.qty, 0));
  const paid = Math.min(total, Math.max(0, round2(Number(input.paid) || 0)));

  /* ---------- Rendez-vous ---------- */
  let rdvStart: string | null = null;
  let rdvStaff: Profile | null = null;
  const main = lines[0]!.item;
  if (input.mode === "rdv") {
    const r = input.rdv;
    if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !/^\d{2}:\d{2}$/.test(r.time)) return { error: "Indiquez la date et l'heure du rendez-vous." };
    rdvStart = agadirToIso(r.date, r.time);
    if (new Date(rdvStart).getTime() < Date.now() - 6 * 3600_000) return { error: "Le rendez-vous est dans le passé : vérifiez la date." };
    if (r.staff_id) {
      const { data } = await supabase.from("profiles").select("*").eq("id", r.staff_id).maybeSingle();
      rdvStaff = data as Profile | null;
      if (!rdvStaff || (rdvStaff.entity_ids.length && !rdvStaff.entity_ids.includes(input.entity_id))) return { error: "Ce praticien ne travaille pas dans cet établissement." };
      const dur = main.duration_min ?? 60;
      const { data: same } = await supabase
        .from("appointments")
        .select("*")
        .eq("staff_id", r.staff_id)
        .gte("starts_at", agadirToIso(r.date, "00:00"))
        .lt("starts_at", agadirToIso(r.date, "23:59"));
      const s = new Date(rdvStart).getTime();
      const clash = ((same ?? []) as { starts_at: string; duration_min: number; status: string; service: string }[]).find((a) => {
        if (a.status === "annule" || a.status === "absent") return false;
        const b = new Date(a.starts_at).getTime();
        return s < b + a.duration_min * 60000 && b < s + dur * 60000;
      });
      if (clash) return { error: `${rdvStaff.full_name} a déjà un rendez-vous à ${fmtTime(clash.starts_at)} (${clash.service}). Choisissez une autre heure ou un autre praticien.` };
    }
  }

  /* ---------- Client ---------- */
  let contact: Contact | null = null;
  let created = false;
  if (input.contact_id) {
    const { data } = await supabase.from("contacts").select("*").eq("id", input.contact_id).maybeSingle();
    contact = data as Contact | null;
    if (!contact) return { error: "Client introuvable : recherchez-le à nouveau." };
  } else {
    const name = (input.new_name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2) return { error: "Saisissez le nom du nouveau client." };
    const phone = formatPhone(input.new_phone);
    if (!phone) return { error: "Saisissez le téléphone du nouveau client (pour le retrouver et le prévenir)." };
    const digits = phoneDigits(phone);
    if (digits.length < 9) return { error: "Le numéro de téléphone semble incomplet." };
    const { data: near } = await supabase.from("contacts").select("id, full_name, phone").ilike("phone", `%${digits.slice(-2)}%`);
    const dup = ((near ?? []) as Pick<Contact, "id" | "full_name" | "phone">[]).find((c) => phoneDigits(c.phone) === digits);
    if (dup) return { error: `Ce numéro est déjà enregistré pour ${dup.full_name}.`, duplicate: { id: dup.id, full_name: dup.full_name, phone: dup.phone } };
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        full_name: name,
        phone,
        email: null,
        sex: null,
        birth_date: null,
        city: "Agadir",
        source: "passage",
        tags: [],
        entity_ids: [input.entity_id],
        status: input.mode === "rdv" && paid === 0 ? "prospect" : "client",
        guardian_name: null,
        notes: null,
        owner_id: profile.id,
        whatsapp_optin: true,
      })
      .select()
      .single();
    if (error || !data) return { error: "Impossible de créer la fiche client." };
    contact = data as Contact;
    created = true;
    await supabase.from("activities").insert({
      contact_id: contact.id,
      entity_id: input.entity_id,
      kind: "visite",
      body: `Fiche créée à l'accueil (${entity(input.entity_id)?.short ?? ""})`,
      author_id: profile.id,
    });
  }
  if (!contact.entity_ids.includes(input.entity_id)) {
    await supabase.from("contacts").update({ entity_ids: [...contact.entity_ids, input.entity_id] }).eq("id", contact.id);
  }

  /* ---------- Rendez-vous ---------- */
  let rdvId: string | null = null;
  if (input.mode === "rdv" && rdvStart) {
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        entity_id: input.entity_id,
        contact_id: contact.id,
        item_id: main.id,
        service: main.name,
        staff_id: rdvStaff?.id ?? null,
        starts_at: rdvStart,
        duration_min: main.duration_min ?? 60,
        status: "confirme",
        room: null,
        price_mad: Number(main.price_mad),
        notes: paid > 0 ? `Réglé à l'accueil : ${mad(paid)}${paid < total ? ` (reste ${mad(total - paid)})` : ""}` : null,
      })
      .select()
      .single();
    if (error || !data) return { error: "Impossible de créer le rendez-vous." };
    rdvId = (data as { id: string }).id;
    await supabase.from("activities").insert({
      contact_id: contact.id,
      entity_id: input.entity_id,
      kind: "rdv",
      body: `Rendez-vous pris à l'accueil : ${main.name} le ${fmtDate(rdvStart, { weekday: "long", day: "numeric", month: "long" })} à ${fmtTime(rdvStart)}${rdvStaff ? ` avec ${rdvStaff.full_name}` : ""}`,
      author_id: profile.id,
    });
  }

  revalidatePath("/agenda");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contact.id}`);
  revalidatePath("/");

  const done = new URLSearchParams({ ok: "1", client: contact.id });
  if (rdvId) done.set("rdv", rdvId);
  if (created) done.set("nouveau", "1");

  /* ---------- Vente (paiement, abonnement, produits) ---------- */
  if (input.mode !== "rdv" || paid > 0) {
    let target: string | null = null;
    try {
      const r = await createSale({
        entity_id: input.entity_id,
        contact_id: contact.id,
        lines: lines.map((l) => ({ item_id: l.item.id, label: l.item.name, qty: l.qty, unit_price: Number(l.item.price_mad) })),
        discount_mode: "mad",
        discount_value: 0,
        method: input.method,
        paid,
        rdv_id: null,
        notes: rdvStart ? `Accueil express · RDV du ${fmtDate(rdvStart, { day: "numeric", month: "short" })} à ${fmtTime(rdvStart)}` : "Accueil express",
      });
      if (r?.error) return { error: `${rdvId ? "Rendez-vous enregistré, mais la vente a échoué : " : ""}${r.error}` };
    } catch (e) {
      target = redirectTarget(e);
      if (!target) throw e;
    }
    const saleId = target?.match(/\/ventes\/([^/?#]+)/)?.[1];
    if (saleId) done.set("vente", saleId);
  }

  await flash(created ? `${contact.full_name} ajouté(e) · accueil terminé` : "Accueil terminé");
  redirect(`/express?${done.toString()}`);
}
