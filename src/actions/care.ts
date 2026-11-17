"use server";

import { revalidatePath } from "next/cache";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo";
import { flash } from "@/lib/flash";
import type { EntityId } from "@/lib/entities";
import type { Contact, Profile } from "@/lib/types";
import { agadirToIso, dayKey, str } from "@/lib/utils";
import {
  CARE_ENTITIES,
  canSeeMedical,
  CONSENT_TEMPLATES,
  PHOTOTYPES,
  TREATMENT_LABEL,
  type CarePhoto,
  type ConsentTemplate,
  type Pregnancy,
  type SkinType,
  type TreatmentKind,
} from "@/lib/types-care";
import type { FormState } from "@/components/action-form";

const SKINS: SkinType[] = ["normale", "seche", "grasse", "mixte", "sensible"];
const PREGNANCIES: Pregnancy[] = ["non", "enceinte", "allaitement"];
const KINDS = Object.keys(TREATMENT_LABEL) as TreatmentKind[];
const TEMPLATES = Object.keys(CONSENT_TEMPLATES) as ConsentTemplate[];
const BUCKET = "care-photos";

/** Établissements où l'utilisateur peut tenir un dossier de soins */
function careEntitiesFor(me: Profile, allowed: EntityId[]): EntityId[] {
  const base = canSeeMedical(me) ? CARE_ENTITIES : (["evolve"] as EntityId[]);
  return base.filter((e) => allowed.includes(e));
}

/** Contexte commun : profil, client visible, établissements de soins autorisés */
async function ctx(contactId: string) {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = data as Contact | null;
  const allowed = scope.allowed.map((e) => e.id);
  if (!contact || !contact.entity_ids.some((e) => allowed.includes(e))) return null;
  return { me, supabase, contact, careIds: careEntitiesFor(me, allowed) };
}

function refresh(contactId: string) {
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/dossiers");
}

async function log(supabase: Awaited<ReturnType<typeof createClient>>, contactId: string, entityId: EntityId, body: string, me: Profile) {
  await supabase.from("activities").insert({ contact_id: contactId, entity_id: entityId, kind: "note", body, author_id: me.id });
}

const cut = (v: string | null, n: number) => (v ? v.slice(0, n) : null);

/* ---------- Fiche santé-beauté ---------- */

export async function saveCareProfile(contactId: string, _s: FormState, fd: FormData): Promise<FormState> {
  const c = await ctx(contactId);
  if (!c) return { error: "Client introuvable." };
  if (!canSeeMedical(c.me)) return { error: "Les données médicales sont réservées à l'équipe de la clinique et de l'institut." };

  const skin = str(fd.get("skin_type")) as SkinType | null;
  const pregnancy = (str(fd.get("pregnancy")) ?? "non") as Pregnancy;
  const photo = Number(str(fd.get("phototype")) ?? 0);
  const row = {
    contact_id: contactId,
    skin_type: skin && SKINS.includes(skin) ? skin : null,
    phototype: (PHOTOTYPES as readonly number[]).includes(photo) ? photo : null,
    pregnancy: PREGNANCIES.includes(pregnancy) ? pregnancy : "non",
    contraindications: cut(str(fd.get("contraindications")), 500),
    allergies: cut(str(fd.get("allergies")), 300),
    treatments: cut(str(fd.get("treatments")), 500),
    history: cut(str(fd.get("history")), 1000),
    notes: cut(str(fd.get("notes")), 1000),
    updated_by: c.me.id,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await c.supabase.from("care_profiles").select("id").eq("contact_id", contactId).maybeSingle();
  const { error } = existing
    ? await c.supabase.from("care_profiles").update(row).eq("id", (existing as { id: string }).id)
    : await c.supabase.from("care_profiles").insert(row);
  if (error) return { error: "Impossible d'enregistrer la fiche." };

  await flash("Fiche santé enregistrée");
  refresh(contactId);
  return undefined;
}

/* ---------- Fiches techniques ---------- */

export async function createTreatment(contactId: string, _s: FormState, fd: FormData): Promise<FormState> {
  const c = await ctx(contactId);
  if (!c) return { error: "Client introuvable." };
  const entityId = str(fd.get("entity_id")) as EntityId | null;
  if (!entityId || !c.careIds.includes(entityId)) return { error: "Choisissez un établissement autorisé." };
  const service = str(fd.get("service"));
  if (!service) return { error: "Indiquez la prestation réalisée." };

  const date = str(fd.get("date")) ?? dayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > dayKey()) return { error: "Date de séance invalide." };
  const time = str(fd.get("time")) ?? "12:00";
  const kindRaw = str(fd.get("kind")) as TreatmentKind | null;
  const kind = kindRaw && KINDS.includes(kindRaw) ? kindRaw : "autre";
  const next = str(fd.get("next_on"));
  if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) return { error: "Date de prochaine séance invalide." };

  const practitioner = str(fd.get("practitioner_id"));
  if (practitioner) {
    const { data: p } = await c.supabase.from("profiles").select("id").eq("id", practitioner).maybeSingle();
    if (!p) return { error: "Praticien introuvable." };
  }
  const appt = str(fd.get("appointment_id"));

  const settings = {
    fluence: cut(str(fd.get("fluence")), 40),
    wavelength: cut(str(fd.get("wavelength")), 40),
    spot: cut(str(fd.get("spot")), 40),
    quantity: cut(str(fd.get("quantity")), 40),
  };
  const zone = cut(str(fd.get("zone")), 80);
  const { error } = await c.supabase.from("treatment_records").insert({
    entity_id: entityId,
    contact_id: contactId,
    appointment_id: appt,
    performed_at: agadirToIso(date, time),
    kind,
    service: service.slice(0, 160),
    practitioner_id: practitioner,
    zone,
    product: cut(str(fd.get("product")), 120),
    lot: cut(str(fd.get("lot")), 60),
    settings: Object.fromEntries(Object.entries(settings).filter(([, v]) => v)),
    observations: cut(str(fd.get("observations")), 2000),
    side_effects: cut(str(fd.get("side_effects")), 500),
    next_on: next,
    created_by: c.me.id,
  });
  if (error) return { error: "Impossible d'enregistrer la fiche technique." };

  await log(c.supabase, contactId, entityId, `Fiche technique : ${service}${zone ? ` (${zone})` : ""}`, c.me);
  await flash("Fiche technique enregistrée");
  refresh(contactId);
  return undefined;
}

export async function deleteTreatment(contactId: string, id: string) {
  const c = await ctx(contactId);
  if (!c) return;
  const { data } = await c.supabase.from("treatment_records").select("id, entity_id, contact_id").eq("id", id).maybeSingle();
  const row = data as { entity_id: EntityId; contact_id: string } | null;
  if (!row || row.contact_id !== contactId || !c.careIds.includes(row.entity_id)) return;
  await c.supabase.from("treatment_records").delete().eq("id", id);
  await flash("Fiche technique supprimée");
  refresh(contactId);
}

/* ---------- Consentements ---------- */

export async function signConsent(contactId: string, _s: FormState, fd: FormData): Promise<FormState> {
  const c = await ctx(contactId);
  if (!c) return { error: "Client introuvable." };
  const entityId = str(fd.get("entity_id")) as EntityId | null;
  if (!entityId || !c.careIds.includes(entityId)) return { error: "Choisissez un établissement autorisé." };
  const tpl = str(fd.get("template")) as ConsentTemplate | null;
  if (!tpl || !TEMPLATES.includes(tpl)) return { error: "Choisissez un modèle de consentement." };
  const signedBy = str(fd.get("signed_by"));
  if (!signedBy) return { error: "Indiquez le nom du signataire." };
  const signature = str(fd.get("signature"));
  if (!signature || !signature.startsWith("data:image/png;base64,")) return { error: "La signature est obligatoire : faites signer le client dans le cadre." };
  if (signature.length > 600_000) return { error: "Signature trop lourde, effacez et recommencez." };
  if (fd.get("read") !== "on") return { error: "Cochez la case confirmant que le client a lu le document." };

  const body = cut(str(fd.get("body")), 6000) ?? CONSENT_TEMPLATES[tpl].body;
  const { error } = await c.supabase.from("consents").insert({
    entity_id: entityId,
    contact_id: contactId,
    template: tpl,
    title: CONSENT_TEMPLATES[tpl].title,
    body,
    signature,
    signed_by: signedBy.slice(0, 120),
    signed_at: new Date().toISOString(),
    collected_by: c.me.id,
  });
  if (error) return { error: "Impossible d'enregistrer le consentement." };

  await log(c.supabase, contactId, entityId, `Consentement signé : ${CONSENT_TEMPLATES[tpl].title}`, c.me);
  await flash("Consentement signé");
  refresh(contactId);
  return undefined;
}

export async function deleteConsent(contactId: string, id: string) {
  const c = await ctx(contactId);
  if (!c || (c.me.role !== "direction" && c.me.role !== "manager")) return;
  const { data } = await c.supabase.from("consents").select("id, entity_id, contact_id").eq("id", id).maybeSingle();
  const row = data as { entity_id: EntityId; contact_id: string } | null;
  if (!row || row.contact_id !== contactId || !c.careIds.includes(row.entity_id)) return;
  await c.supabase.from("consents").delete().eq("id", id);
  await flash("Consentement supprimé");
  refresh(contactId);
}

/* ---------- Photos avant / après ---------- */

export async function addCarePhotos(contactId: string, _s: FormState, fd: FormData): Promise<FormState> {
  const c = await ctx(contactId);
  if (!c) return { error: "Client introuvable." };
  const entityId = str(fd.get("entity_id")) as EntityId | null;
  if (!entityId || !c.careIds.includes(entityId)) return { error: "Choisissez un établissement autorisé." };
  const kind = str(fd.get("kind")) === "apres" ? "apres" : "avant";
  const zone = cut(str(fd.get("zone")), 60);
  if (!zone) return { error: "Indiquez la zone photographiée." };
  const takenOn = str(fd.get("taken_on")) ?? dayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(takenOn)) return { error: "Date invalide." };

  const files = fd.getAll("photo").filter((f): f is File => typeof f === "object" && "size" in f && f.size > 0);
  if (!files.length) return { error: "Ajoutez au moins une photo." };
  if (files.length > 6) return { error: "6 photos maximum à la fois." };
  for (const f of files) {
    if (!f.type.startsWith("image/")) return { error: "Seules les images sont acceptées." };
    if (f.size > 8 * 1024 * 1024) return { error: "Photo trop lourde (8 Mo maximum)." };
  }

  const rows: Omit<CarePhoto, "id" | "created_at">[] = [];
  for (const f of files) {
    let url: string;
    if (DEMO) {
      url = `data:${f.type};base64,${Buffer.from(await f.arrayBuffer()).toString("base64")}`;
    } else {
      const ext = f.type === "image/webp" ? "webp" : f.type === "image/png" ? "png" : "jpg";
      const path = `${contactId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await c.supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
      if (upErr) return { error: "Échec de l'envoi de la photo." };
      url = path;
    }
    rows.push({ entity_id: entityId, contact_id: contactId, kind, zone, taken_on: takenOn, url, note: cut(str(fd.get("note")), 200), created_by: c.me.id });
  }
  const { error } = await c.supabase.from("care_photos").insert(rows);
  if (error) return { error: "Impossible d'enregistrer les photos." };

  await flash(rows.length > 1 ? `${rows.length} photos ajoutées` : "Photo ajoutée");
  refresh(contactId);
  return undefined;
}

export async function deleteCarePhoto(contactId: string, id: string) {
  const c = await ctx(contactId);
  if (!c) return;
  const { data } = await c.supabase.from("care_photos").select("*").eq("id", id).maybeSingle();
  const row = data as CarePhoto | null;
  if (!row || row.contact_id !== contactId || !c.careIds.includes(row.entity_id)) return;
  if (!DEMO && !row.url.startsWith("data:") && !row.url.startsWith("http")) await c.supabase.storage.from(BUCKET).remove([row.url]);
  await c.supabase.from("care_photos").delete().eq("id", id);
  await flash("Photo supprimée");
  refresh(contactId);
}
