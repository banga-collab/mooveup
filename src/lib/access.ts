/**
 * Accueil : cartes membres (QR), contrôle d'accès, créneaux de réservation en ligne.
 * Fichier serveur uniquement (ne pas importer depuis un composant client).
 */
import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO, demoClient } from "./demo";
import { ENTITIES, type EntityId } from "./entities";
import { addDaysKey, agadirToIso, dayKey, daysUntil, fmtDate, fmtTime, mad } from "./utils";
import type { Appointment, Sale, Subscription } from "./types";
import type { Checkin, MemberCard } from "./types-access";
import { CODE_ALPHABET, formatCode } from "@/components/access/code";
import "@/lib/supabase/paginate";

/* ---------- Établissements ---------- */

/** Établissements à abonnement : l'accès se contrôle par l'abonnement */
export const SPORT_ENTITIES = ENTITIES.filter((e) => e.kind === "sport").map((e) => e.id);
/** Établissements proposés à la réservation en ligne (dans cet ordre) */
export const BOOKABLE: EntityId[] = ["institut", "clinic", "evolve", "sports", "kids"];
/** Jours de fermeture (0 = dimanche) */
export const CLOSED_DAYS: Partial<Record<EntityId, number[]>> = { clinic: [0] };
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 21;

/* ---------- Cartes membres ---------- */

export function newCardCode(rand: () => number = Math.random) {
  let core = "";
  for (let i = 0; i < 8; i++) core += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return formatCode(core);
}

/** Carte du client (créée à la volée si elle n'existe pas encore) */
export async function ensureCard(supabase: SupabaseClient, contactId: string): Promise<MemberCard | null> {
  const { data } = await supabase.from("member_cards").select("*").eq("contact_id", contactId).maybeSingle();
  if (data) return data as MemberCard;
  for (let i = 0; i < 4; i++) {
    const code = newCardCode();
    const { data: taken } = await supabase.from("member_cards").select("id").eq("code", code).maybeSingle();
    if (taken) continue;
    const { data: created } = await supabase.from("member_cards").insert({ contact_id: contactId, code, regenerated_at: null }).select().single();
    if (created) return created as MemberCard;
  }
  return null;
}

/** QR code en SVG (texte encodé : le code de la carte) */
export async function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111827", light: "#ffffff" } });
}

/* ---------- Contrôle d'accès ---------- */

export type AccessCode = "ok_sub" | "ok_pack" | "ok_rdv" | "expire" | "suspendu" | "impaye" | "pack_vide" | "futur" | "aucun" | "pas_rdv";

export type AccessVerdict = {
  entity_id: EntityId;
  ok: boolean;
  code: AccessCode;
  /** Titre court : « Accès autorisé », « Abonnement expiré depuis 12 j »… */
  reason: string;
  /** Détail : formule, rendez-vous… */
  plan: string | null;
  sub: Subscription | null;
  appt: Appointment | null;
  daysLeft: number | null;
  sessionsLeft: number | null;
  /** Reste à payer dans cet établissement */
  balance: number;
};

export type AccessData = { subs: Subscription[]; sales: Sale[]; appts: Appointment[] };

const LIVE_APPT = ["prevu", "confirme", "arrive"];

/** Droit d'accès d'un client à un établissement, aujourd'hui */
export function evaluateAccess(entityId: EntityId, data: AccessData, today = dayKey()): AccessVerdict {
  const subs = data.subs.filter((s) => s.entity_id === entityId);
  const live = subs.filter((s) => s.status === "actif" && s.start_date <= today && s.end_date >= today);
  const timeSub = live.filter((s) => s.sessions_left === null).sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0] ?? null;
  const pack = live.filter((s) => s.sessions_left !== null && s.sessions_left > 0).sort((a, b) => (a.end_date > b.end_date ? 1 : -1))[0] ?? null;
  // Impayé : reste à payer sur les ventes de la période en cours (depuis le début de l'abonnement)
  const current = timeSub ?? pack;
  const from = current ? addDaysKey(current.start_date, -7) : addDaysKey(today, -60);
  const balance = data.sales
    .filter((s) => s.entity_id === entityId && s.status === "impayee" && dayKey(s.sold_at) >= from)
    .reduce((a, s) => a + Math.max(0, s.total_mad - s.paid_mad), 0);
  const appt =
    data.appts
      .filter((a) => a.entity_id === entityId && LIVE_APPT.includes(a.status) && dayKey(a.starts_at) === today)
      .sort((a, b) => Math.abs(new Date(a.starts_at).getTime() - Date.now()) - Math.abs(new Date(b.starts_at).getTime() - Date.now()))[0] ?? null;

  const base = { entity_id: entityId, sub: null, appt: null, daysLeft: null, sessionsLeft: null, balance, plan: null } as const;

  if (timeSub || pack) {
    if (balance > 0 && !appt) {
      const s = (timeSub ?? pack)!;
      return { ...base, ok: false, code: "impaye", reason: `Impayé : ${mad(balance)} à régler`, plan: s.name, sub: s, daysLeft: daysUntil(s.end_date) };
    }
  }
  if (timeSub) {
    return { ...base, ok: true, code: "ok_sub", reason: "Accès autorisé", plan: timeSub.name, sub: timeSub, daysLeft: daysUntil(timeSub.end_date), sessionsLeft: pack?.sessions_left ?? null };
  }
  if (appt) {
    return { ...base, ok: true, code: "ok_rdv", reason: "Rendez-vous aujourd'hui", plan: `${appt.service} à ${fmtTime(appt.starts_at)}`, appt };
  }
  if (pack) {
    return { ...base, ok: true, code: "ok_pack", reason: "Accès autorisé", plan: pack.name, sub: pack, daysLeft: daysUntil(pack.end_date), sessionsLeft: pack.sessions_left };
  }

  const suspended = subs.find((s) => s.status === "suspendu" && s.end_date >= today);
  if (suspended) return { ...base, ok: false, code: "suspendu", reason: "Abonnement suspendu", plan: suspended.name, sub: suspended };
  const empty = live.find((s) => s.sessions_left !== null && s.sessions_left <= 0);
  if (empty) return { ...base, ok: false, code: "pack_vide", reason: "Pack terminé : plus aucune séance", plan: empty.name, sub: empty, sessionsLeft: 0 };
  const future = subs.filter((s) => s.status === "actif" && s.start_date > today).sort((a, b) => (a.start_date > b.start_date ? 1 : -1))[0];
  if (future) return { ...base, ok: false, code: "futur", reason: `Abonnement à partir du ${fmtDate(future.start_date, { day: "numeric", month: "long" })}`, plan: future.name, sub: future };
  const last = [...subs].sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0];
  if (last) {
    const since = Math.max(0, -daysUntil(last.end_date));
    const reason = last.status === "resilie" ? "Abonnement résilié" : since === 0 ? "Abonnement expiré" : `Abonnement expiré depuis ${since} j`;
    return { ...base, ok: false, code: "expire", reason, plan: last.name, sub: last, daysLeft: -since };
  }
  return SPORT_ENTITIES.includes(entityId)
    ? { ...base, ok: false, code: "aucun", reason: "Pas d'abonnement dans cet établissement" }
    : { ...base, ok: false, code: "pas_rdv", reason: "Pas de rendez-vous aujourd'hui" };
}

/** Charge abonnements, impayés et rendez-vous du jour d'un client */
export async function loadAccessData(supabase: SupabaseClient, contactId: string, entityIds: EntityId[]): Promise<AccessData> {
  const today = dayKey();
  const [{ data: subs }, { data: sales }, { data: appts }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("contact_id", contactId).in("entity_id", entityIds),
    supabase.from("sales").select("*").eq("contact_id", contactId).in("entity_id", entityIds).eq("status", "impayee"),
    supabase
      .from("appointments")
      .select("*")
      .eq("contact_id", contactId)
      .in("entity_id", entityIds)
      .gte("starts_at", agadirToIso(today, "00:00"))
      .lt("starts_at", agadirToIso(today, "23:59")),
  ]);
  return { subs: (subs ?? []) as Subscription[], sales: (sales ?? []) as Sale[], appts: (appts ?? []) as Appointment[] };
}

/** Choisit le verdict à afficher parmi plusieurs établissements (autorisé d'abord, puis le refus le plus parlant) */
export function bestVerdict(verdicts: AccessVerdict[]): AccessVerdict | null {
  const rank: Record<AccessCode, number> = { ok_sub: 0, ok_rdv: 1, ok_pack: 2, impaye: 3, suspendu: 4, pack_vide: 5, expire: 6, futur: 7, aucun: 8, pas_rdv: 9 };
  return [...verdicts].sort((a, b) => rank[a.code] - rank[b.code])[0] ?? null;
}

/* ---------- Fréquentation ---------- */

export const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6 h → 22 h

const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Casablanca" });
export function hourOf(iso: string) {
  return Number(hourFmt.format(new Date(iso)));
}

/** Entrées par heure aujourd'hui et moyenne des jours précédents */
export function hourlyStats(rows: Pick<Checkin, "created_at">[], today = dayKey()) {
  const todayCounts = new Map<number, number>();
  const pastCounts = new Map<number, number>();
  const days = new Set<string>();
  for (const r of rows) {
    const d = dayKey(r.created_at);
    const h = hourOf(r.created_at);
    if (d === today) todayCounts.set(h, (todayCounts.get(h) ?? 0) + 1);
    else {
      days.add(d);
      pastCounts.set(h, (pastCounts.get(h) ?? 0) + 1);
    }
  }
  const n = Math.max(1, days.size);
  return HOURS.map((h) => ({ hour: h, today: todayCounts.get(h) ?? 0, avg: Math.round(((pastCounts.get(h) ?? 0) / n) * 10) / 10 }));
}

/** Adresse publique du site (liens WhatsApp, paiement, agenda) */
export async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/* ---------- Réservation en ligne ---------- */

/** Client Supabase pour les pages publiques (clé service côté serveur, ou base de démo) */
export function publicDb(): SupabaseClient {
  if (DEMO) return demoClient(null) as SupabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("La réservation en ligne nécessite SUPABASE_SERVICE_ROLE_KEY côté serveur.");
  return createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Busy = Pick<Appointment, "starts_at" | "duration_min" | "staff_id" | "status">;

const overlap = (a: number, aDur: number, b: number, bDur: number) => a < b + bDur * 60_000 && b < a + aDur * 60_000;

/**
 * Créneaux libres d'une journée (pas de 30 min, 9 h-21 h) :
 * au moins un praticien libre, ou aucun rendez-vous si l'établissement n'a pas de praticien.
 * Renvoie les heures « HH:MM » et, pour chacune, le praticien proposé.
 */
export function computeSlots({ date, entityId, duration, staffIds, appts, now = Date.now() }: { date: string; entityId: EntityId; duration: number; staffIds: string[]; appts: Busy[]; now?: number }) {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (CLOSED_DAYS[entityId]?.includes(dow)) return [];
  const busy = appts.filter((a) => a.status !== "annule" && a.status !== "absent");
  const out: { time: string; staffId: string | null }[] = [];
  for (let m = OPEN_HOUR * 60; m + duration <= CLOSE_HOUR * 60; m += 30) {
    const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const start = new Date(agadirToIso(date, time)).getTime();
    if (start < now + 30 * 60_000) continue;
    const clash = busy.filter((a) => overlap(start, duration, new Date(a.starts_at).getTime(), a.duration_min));
    if (!staffIds.length) {
      if (!clash.length) out.push({ time, staffId: null });
      continue;
    }
    const taken = new Set(clash.map((a) => a.staff_id).filter(Boolean));
    const free = staffIds.filter((s) => !taken.has(s));
    const unassigned = clash.filter((a) => !a.staff_id).length;
    if (free.length > unassigned) {
      // Le praticien le moins chargé de la journée
      const load = (s: string) => busy.filter((a) => a.staff_id === s).length;
      out.push({ time, staffId: [...free].sort((a, b) => load(a) - load(b))[0]! });
    }
  }
  return out;
}

/** Référence courte d'une réservation : « R-4K7P2 » */
export function bookingRef() {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `R-${s}`;
}

/* ---------- Paiement CMI (acompte) ---------- */

/** Variables d'environnement CMI présentes ? */
export function cmiConfigured(clientId: string) {
  return !!((clientId || process.env.CMI_CLIENT_ID) && process.env.CMI_STORE_KEY && process.env.CMI_GATEWAY_URL);
}

/** Formulaire de redirection vers la passerelle CMI (hash « ver3 ») */
export function cmiForm(input: { clientId: string; amount: number; oid: string; okUrl: string; failUrl: string; callbackUrl: string; shopUrl: string; name: string; email: string | null; phone: string }) {
  const storeKey = process.env.CMI_STORE_KEY ?? "";
  const params: Record<string, string> = {
    clientid: input.clientId || process.env.CMI_CLIENT_ID || "",
    amount: input.amount.toFixed(2),
    okUrl: input.okUrl,
    failUrl: input.failUrl,
    callbackUrl: input.callbackUrl,
    shopurl: input.shopUrl,
    TranType: "PreAuth",
    currency: "504",
    rnd: String(Date.now()),
    storetype: "3D_PAY_HOSTING",
    hashAlgorithm: "ver3",
    lang: "fr",
    refreshtime: "5",
    oid: input.oid,
    BillToName: input.name,
    email: input.email ?? "",
    tel: input.phone,
    encoding: "UTF-8",
  };
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  const keys = Object.keys(params)
    .filter((k) => !["hash", "encoding"].includes(k.toLowerCase()))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const plain = `${keys.map((k) => esc(params[k]!)).join("|")}|${esc(storeKey)}`;
  params.hash = createHash("sha512").update(plain, "utf8").digest("base64");
  return { action: process.env.CMI_GATEWAY_URL ?? "", params };
}
