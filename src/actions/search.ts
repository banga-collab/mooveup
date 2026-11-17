"use server";

import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTeam } from "@/lib/data";
import { addDaysKey, agadirToIso, dayKey, fmtDate, fmtTime, isoToAgadir, mad } from "@/lib/utils";
import type { Appointment, Campaign, CatalogItem, Contact, Lead, Sale, Subscription, Task } from "@/lib/types";
import type { GiftCard } from "@/lib/types-loyalty";
import type { Supplier } from "@/lib/types-ops";
import type { MemberCard } from "@/lib/types-access";
import type { SearchResult } from "@/lib/types-shell";

/*
 * Cache de 60 s des données de recherche (par membre et périmètre) : la première lettre
 * charge les tables, les suivantes répondent tout de suite. Les résultats peuvent avoir
 * au plus une minute de retard, ce qui suffit pour une recherche.
 */
const TTL = 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, load: () => PromiseLike<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return hit.value as Promise<T>;
  if (cache.size > 200) for (const [k, v] of cache) if (now - v.at >= TTL) cache.delete(k);
  const value = Promise.resolve(load()).catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: now, value });
  return value;
}

export type SearchHit = { id: string; full_name: string; phone: string | null; status: Contact["status"]; entity_ids: string[] };

/** Texte sans accents ni casse */
function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Vrai si les champs contiennent tous les mots de la recherche (sans accents, sans casse) ou les chiffres d'un téléphone */
function matcher(q: string) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const digits = q.replace(/\D/g, "");
  const onlyDigits = digits.length >= 3 && digits.length === q.replace(/[\s.+()-]/g, "").length;
  return (...fields: (string | number | null | undefined)[]) => {
    const vals = fields.filter((f) => f !== null && f !== undefined && f !== "").map(String);
    if (!vals.length) return false;
    const hay = norm(vals.join(" "));
    if (words.every((w) => hay.includes(w))) return true;
    return onlyDigits && vals.some((v) => v.replace(/\D/g, "").includes(digits));
  };
}

/** « 17/11 », « 17/11/2026 », « 2026-11-17 » → AAAA-MM-JJ */
function parseDay(q: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const m = q.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : dayKey().slice(0, 4);
  const d = `${y}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d ? null : d;
}

const PER = 5;
const first = <T,>(rows: T[], n = PER) => rows.slice(0, n);

/**
 * Recherche globale (Ctrl+K) dans toutes les données du périmètre.
 * Renvoie des résultats regroupés (clients, ventes, rendez-vous, prospects…), limités par groupe.
 */
export async function searchAll(q: string): Promise<SearchResult[]> {
  const term = String(q ?? "").trim().slice(0, 80);
  if (term.length < 2) return [];
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const ids = scope.ids;
  const m = matcher(term);
  const desk = me.role !== "staff";
  const mgmt = me.role === "direction" || me.role === "manager";
  const day = parseDay(term);
  const looksCode = /^[a-z0-9-]{3,}$/i.test(term);
  const looksNumber = /mu-|\d{3,}/i.test(term);
  const like = `%${term.replace(/[%_,()]/g, "")}%`;
  const now = new Date();
  const none = Promise.resolve({ data: [] as never[] });
  const ck = `${me.id}|${ids.join(",")}`;

  const [contactsR, cardsR] = await Promise.all([
    cached(`${ck}:contacts`, () => supabase.from("contacts").select("*").overlaps("entity_ids", ids).order("full_name").limit(5000)),
    looksCode ? supabase.from("member_cards").select("*").ilike("code", like).limit(10) : none,
  ]);
  const contacts = (contactsR.data ?? []) as Contact[];
  const byContact = new Map(contacts.map((c) => [c.id, c]));
  const cardOf = new Map(((cardsR.data ?? []) as MemberCard[]).map((c) => [c.contact_id, c.code]));
  // Classement : le nom commence par la recherche > un mot du nom commence par elle > le nom la contient > autre champ (parent, e-mail…)
  const nq = norm(term);
  const rank = (c: Contact) => {
    const n = norm(c.full_name);
    if (n.startsWith(nq)) return 0;
    if (n.split(/\s+/).some((w) => w.startsWith(nq))) return 1;
    if (n.includes(nq) || cardOf.has(c.id)) return 2;
    return 3;
  };
  const matched = contacts
    .filter((c) => cardOf.has(c.id) || m(c.full_name, c.email, c.phone, c.guardian_name))
    .map((c) => ({ c, r: rank(c) }))
    .sort((a, b) => a.r - b.r || a.c.full_name.localeCompare(b.c.full_name, "fr"))
    .map((x) => x.c);
  const M = matched.slice(0, 60).map((c) => c.id);
  const inM = new Set(M);
  const name = (id: string | null) => (id ? (byContact.get(id)?.full_name ?? "") : "");

  const from = new Date(now.getTime() - 45 * 86_400_000).toISOString();
  const to = new Date(now.getTime() + 90 * 86_400_000).toISOString();

  const [salesNum, salesCli, apptsWin, apptsDay, leadsR, subsR, catR, giftR, tasksR, supR, campR, team] = await Promise.all([
    looksNumber ? supabase.from("sales").select("*").in("entity_id", ids).ilike("number", like).order("sold_at", { ascending: false }).limit(PER) : none,
    M.length ? supabase.from("sales").select("*").in("entity_id", ids).in("contact_id", M).order("sold_at", { ascending: false }).limit(PER) : none,
    cached(`${ck}:appts`, () => supabase.from("appointments").select("*").in("entity_id", ids).gte("starts_at", from).lte("starts_at", to).order("starts_at").limit(4000)),
    day ? supabase.from("appointments").select("*").in("entity_id", ids).gte("starts_at", agadirToIso(day, "00:00")).lt("starts_at", agadirToIso(addDaysKey(day, 1), "00:00")).order("starts_at").limit(PER) : none,
    cached(`${ck}:leads`, () => supabase.from("leads").select("*").in("entity_id", ids).order("updated_at", { ascending: false }).limit(3000)),
    cached(`${ck}:subs`, () => supabase.from("subscriptions").select("*").in("entity_id", ids).order("end_date", { ascending: false }).limit(4000)),
    cached(`${ck}:catalog`, () => supabase.from("catalog_items").select("*").in("entity_id", ids).eq("active", true).order("name").limit(2000)),
    cached(`${ck}:gift`, () => supabase.from("gift_cards").select("*").in("entity_id", ids).order("created_at", { ascending: false }).limit(2000)),
    cached(`${ck}:tasks`, () => supabase.from("tasks").select("*").in("entity_id", ids).order("due_date").limit(3000)),
    desk ? cached(`${ck}:suppliers`, () => supabase.from("suppliers").select("*").overlaps("entity_ids", ids).order("name").limit(500)) : none,
    desk ? cached(`${ck}:campaigns`, () => supabase.from("campaigns").select("*").order("created_at", { ascending: false }).limit(500)) : none,
    cached(`${ck}:team`, () => getTeam(scope)),
  ]);

  const out: SearchResult[] = [];

  /* Clients */
  for (const c of first(matched, 6)) {
    out.push({
      id: c.id,
      group: "clients",
      label: c.full_name,
      sub: [c.guardian_name && !norm(c.full_name).includes(nq) && norm(c.guardian_name).includes(nq) ? `Parent : ${c.guardian_name}` : null, c.phone, cardOf.get(c.id), c.email].filter(Boolean).slice(0, 2).join(" · "),
      href: `/contacts/${c.id}`,
      entity_ids: c.entity_ids,
      contact_id: c.id,
    });
  }

  /* Ventes */
  const sales = new Map<string, Sale>();
  for (const s of [...((salesNum.data ?? []) as Sale[]), ...((salesCli.data ?? []) as Sale[])]) sales.set(s.id, s);
  for (const s of first([...sales.values()])) {
    out.push({
      id: s.id,
      group: "ventes",
      label: [s.number, name(s.contact_id)].filter(Boolean).join(" · "),
      sub: `${mad(Number(s.total_mad))} · ${fmtDate(s.sold_at, { day: "numeric", month: "short" })}`,
      href: `/ventes/${s.id}`,
      entity_ids: [s.entity_id],
    });
  }

  /* Rendez-vous : le jour demandé, puis ceux du client / de la prestation (à venir d'abord) */
  const appts = new Map<string, Appointment>();
  for (const a of (apptsDay.data ?? []) as Appointment[]) appts.set(a.id, a);
  const nowIso = now.toISOString();
  const found = ((apptsWin.data ?? []) as Appointment[]).filter((a) => inM.has(a.contact_id) || m(a.service));
  const next = found.filter((a) => a.starts_at >= nowIso);
  const past = found.filter((a) => a.starts_at < nowIso).reverse();
  for (const a of [...next, ...past]) if (appts.size < PER) appts.set(a.id, a);
  for (const a of appts.values()) {
    out.push({
      id: a.id,
      group: "rdv",
      label: [name(a.contact_id), a.service].filter(Boolean).join(" · "),
      sub: `${fmtDate(a.starts_at, { weekday: "short", day: "numeric", month: "short" })} ${fmtTime(a.starts_at)}`,
      href: `/agenda?date=${isoToAgadir(a.starts_at).date}&sel=${a.id}`,
      entity_ids: [a.entity_id],
    });
  }

  /* Prospects */
  for (const l of first(((leadsR.data ?? []) as Lead[]).filter((l) => inM.has(l.contact_id) || m(l.interest)))) {
    const n = name(l.contact_id);
    out.push({ id: l.id, group: "prospects", label: n || l.interest, sub: `${l.interest} · ${l.stage}`, href: `/prospects?q=${encodeURIComponent(n || l.interest)}`, entity_ids: [l.entity_id] });
  }

  /* Abonnements */
  for (const s of first(((subsR.data ?? []) as Subscription[]).filter((s) => inM.has(s.contact_id) || m(s.name)))) {
    const n = name(s.contact_id);
    out.push({
      id: s.id,
      group: "abonnements",
      label: [n, s.name].filter(Boolean).join(" · "),
      sub: `${s.status} · ${fmtDate(s.end_date, { day: "numeric", month: "short", year: "numeric" })}`,
      href: `/abonnements?q=${encodeURIComponent(n || s.name)}`,
      entity_ids: [s.entity_id],
    });
  }

  /* Catalogue & produits */
  for (const i of first(((catR.data ?? []) as CatalogItem[]).filter((i) => m(i.name, i.category)))) {
    out.push({
      id: i.id,
      group: "catalogue",
      label: i.name,
      sub: `${mad(Number(i.price_mad))} · ${i.kind === "produit" && i.stock !== null ? `stock ${i.stock}` : i.category}`,
      href: `/catalogue/${i.id}`,
      entity_ids: [i.entity_id],
    });
  }

  /* Cartes cadeaux */
  const gifts = ((giftR.data ?? []) as GiftCard[]).filter(
    (g) => m(g.code, g.buyer_name, g.beneficiary_name) || (!!g.buyer_contact_id && inM.has(g.buyer_contact_id)) || (!!g.beneficiary_contact_id && inM.has(g.beneficiary_contact_id)),
  );
  for (const g of first(gifts)) {
    out.push({
      id: g.id,
      group: "cartes",
      label: [g.code, g.beneficiary_name || g.buyer_name].filter(Boolean).join(" · "),
      sub: `${mad(Number(g.balance_mad))} / ${mad(Number(g.amount_mad))}`,
      href: `/fidelite/cartes/${g.id}`,
      entity_ids: [g.entity_id],
    });
  }

  /* Tâches (non terminées d'abord) */
  const tasks = ((tasksR.data ?? []) as Task[]).filter((t) => m(t.title) || (!!t.contact_id && inM.has(t.contact_id))).sort((a, b) => Number(a.done) - Number(b.done));
  for (const t of first(tasks)) {
    out.push({
      id: t.id,
      group: "taches",
      label: t.title,
      sub: [t.contact_id ? name(t.contact_id) : null, t.due_date ? fmtDate(t.due_date, { day: "numeric", month: "short" }) : null].filter(Boolean).join(" · "),
      href: `/taches?q=${encodeURIComponent(t.title)}`,
      entity_ids: t.entity_id ? [t.entity_id] : [],
    });
  }

  /* Fournisseurs */
  for (const s of first(((supR.data ?? []) as Supplier[]).filter((s) => m(s.name, s.contact_name, s.phone, s.email, s.city)))) {
    out.push({ id: s.id, group: "fournisseurs", label: s.name, sub: [s.contact_name, s.phone].filter(Boolean).join(" · "), href: `/stock?onglet=fournisseurs&fournisseur=${s.id}`, entity_ids: s.entity_ids });
  }

  /* Campagnes */
  const camps = ((campR.data ?? []) as Campaign[]).filter((c) => {
    const ents = c.segment?.entity_ids ?? [];
    return (ents.length ? ents.some((e) => ids.includes(e)) : scope.allowed.length > 1) && m(c.name, c.message);
  });
  for (const c of first(camps)) {
    out.push({ id: c.id, group: "campagnes", label: c.name, sub: `${c.channel} · ${c.status}`, href: `/campagnes/${c.id}`, entity_ids: c.segment?.entity_ids ?? [] });
  }

  /* Équipe */
  for (const p of first(team.filter((p) => m(p.full_name, p.job_title, p.email, p.phone)))) {
    out.push({
      id: p.id,
      group: "equipe",
      label: p.full_name,
      sub: [p.job_title, p.phone].filter(Boolean).join(" · "),
      href: mgmt ? `/equipe?q=${encodeURIComponent(p.full_name)}` : "/planning",
      entity_ids: p.entity_ids,
    });
  }

  return out;
}

/** Recherche rapide de clients (compatibilité avec l'ancienne palette) */
export async function searchContacts(q: string): Promise<SearchHit[]> {
  const scope = await getScope();
  const supabase = await createClient();
  const cids = (await searchAll(q)).filter((r) => r.group === "clients").map((r) => r.id);
  if (!cids.length) return [];
  const { data } = await supabase.from("contacts").select("*").in("id", cids).overlaps("entity_ids", scope.ids);
  return ((data ?? []) as Contact[]).map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone, status: c.status, entity_ids: c.entity_ids }));
}
