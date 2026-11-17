/**
 * Clients à risque de départ : score 0-100 et raisons lisibles.
 * Fonction pure, en une passe par source de données (index par client), sans double boucle.
 */
import { entity } from "./entities";
import { diffDays } from "./forecast";

export type RiskLevel = "eleve" | "moyen" | "faible";
export const RISK_LABEL: Record<RiskLevel, string> = { eleve: "Élevé", moyen: "Moyen", faible: "Faible" };

export type RiskSignal = "frequentation" | "abo_expire" | "abo_bientot" | "pack" | "suspendu" | "absences" | "impaye" | "avis" | "inactif" | "recent";

export type ChurnAction = { kind: "renouveler" | "appeler" | "relancer"; label: string };

export type ChurnRow = {
  contactId: string;
  name: string;
  phone: string | null;
  entityId: string;
  score: number;
  level: RiskLevel;
  /** Raisons triées par poids (la première est la principale) */
  reasons: string[];
  main: RiskSignal;
  value12: number;
  lastVisit: string | null;
  action: ChurnAction;
  /** Message WhatsApp pré-rempli */
  waText: string;
};

export type ChurnInput = {
  today: string;
  scopeIds: string[];
  contacts: { id: string; full_name: string; phone: string | null; entity_ids: string[]; status: string; created_at: string }[];
  /** Jours de présence (passage, RDV honoré, achat) sur ~180 jours */
  visits: { contact_id: string; entity_id: string; day: string }[];
  /** RDV passés sur 90 jours */
  appointments: { contact_id: string; entity_id: string; status: string; day: string }[];
  subscriptions: { contact_id: string; entity_id: string; name: string; start_date: string; end_date: string; status: string; auto_renew: boolean; sessions_left: number | null }[];
  /** Ventes sur 12 mois (hors remboursements) ; `due` = reste à payer */
  sales: { contact_id: string | null; entity_id: string; total: number; due: number; day: string }[];
  reviews: { contact_id: string; entity_id: string; rating: number | null; handled: boolean; day: string }[];
};

type Hit = { signal: RiskSignal; points: number; text: string; entityId: string | null; extra?: string };

type Agg = {
  visitDays: Set<string>;
  visitsByEntity: Map<string, number>;
  first: string | null;
  last: string | null;
  recent: number;
  baseline: number;
  value12: number;
  due: number;
  dueEntity: string | null;
  absences: number;
  cancels: number;
  absEntity: string | null;
  review: { rating: number; handled: boolean; day: string; entityId: string } | null;
};

const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const shortDate = (d: string) => dayFmt.format(new Date(`${d}T12:00:00Z`));
const firstName = (n: string) => n.split(/\s+/)[0] ?? n;

export function scoreLevel(score: number): RiskLevel | null {
  if (score >= 60) return "eleve";
  if (score >= 35) return "moyen";
  if (score >= 15) return "faible";
  return null;
}

export function computeChurn(input: ChurnInput): ChurnRow[] {
  const { today } = input;
  const scope = new Set(input.scopeIds);
  const d30 = addDays(today, -30);
  const d120 = addDays(today, -120);
  const d365 = addDays(today, -365);

  const aggs = new Map<string, Agg>();
  const agg = (id: string) => {
    let a = aggs.get(id);
    if (!a) {
      a = { visitDays: new Set(), visitsByEntity: new Map(), first: null, last: null, recent: 0, baseline: 0, value12: 0, due: 0, dueEntity: null, absences: 0, cancels: 0, absEntity: null, review: null };
      aggs.set(id, a);
    }
    return a;
  };

  /* Présences (un jour compté une fois par client) */
  for (const v of input.visits) {
    if (!scope.has(v.entity_id) || v.day > today) continue;
    const a = agg(v.contact_id);
    a.visitsByEntity.set(v.entity_id, (a.visitsByEntity.get(v.entity_id) ?? 0) + 1);
    if (a.visitDays.has(v.day)) continue;
    a.visitDays.add(v.day);
    if (!a.first || v.day < a.first) a.first = v.day;
    if (!a.last || v.day > a.last) a.last = v.day;
    if (v.day > d30) a.recent++;
    else if (v.day > d120) a.baseline++;
  }

  /* Ventes : valeur 12 mois et impayés */
  for (const s of input.sales) {
    if (!s.contact_id || !scope.has(s.entity_id) || s.day < d365) continue;
    const a = agg(s.contact_id);
    a.value12 += s.total;
    if (s.due > 0.5) {
      a.due += s.due;
      a.dueEntity = s.entity_id;
    }
    if (!a.first || s.day < a.first) a.first = s.day;
  }

  /* Absences et annulations (90 j) */
  const d90 = addDays(today, -90);
  for (const r of input.appointments) {
    if (!scope.has(r.entity_id) || r.day < d90 || r.day > today) continue;
    if (r.status === "absent") {
      const a = agg(r.contact_id);
      a.absences++;
      a.absEntity = r.entity_id;
    } else if (r.status === "annule") agg(r.contact_id).cancels++;
  }

  /* Avis : on garde le plus mauvais des 180 derniers jours */
  const d180 = addDays(today, -180);
  for (const r of input.reviews) {
    if (r.rating === null || !scope.has(r.entity_id) || r.day < d180) continue;
    const a = agg(r.contact_id);
    if (!a.review || r.rating < a.review.rating) a.review = { rating: r.rating, handled: r.handled, day: r.day, entityId: r.entity_id };
  }

  /* Dernier abonnement par client et établissement */
  type Sub = ChurnInput["subscriptions"][number];
  const latestSub = new Map<string, Sub[]>();
  const latestBy = new Map<string, Sub>();
  for (const s of input.subscriptions) {
    if (!scope.has(s.entity_id)) continue;
    const k = `${s.contact_id}|${s.entity_id}|${s.sessions_left === null ? "t" : "p"}`;
    const cur = latestBy.get(k);
    if (!cur || cur.end_date < s.end_date) latestBy.set(k, s);
  }
  for (const [k, s] of latestBy) {
    const cid = k.slice(0, k.indexOf("|"));
    const list = latestSub.get(cid) ?? [];
    list.push(s);
    latestSub.set(cid, list);
  }

  const rows: ChurnRow[] = [];
  for (const c of input.contacts) {
    if (c.status === "prospect") continue;
    const a = aggs.get(c.id);
    const subs = latestSub.get(c.id) ?? [];
    const hasLiveSub = subs.some((s) => s.end_date >= today && s.status !== "resilie");
    // Rien à perdre : aucune activité, aucun achat ni abonnement récents
    if (!a?.last && !a?.value12 && !hasLiveSub && !subs.some((s) => s.end_date >= addDays(today, -45))) continue;

    const hits: Hit[] = [];

    /* Abonnements */
    for (const s of subs) {
      if (s.status === "resilie") continue;
      const left = diffDays(today, s.end_date);
      if (s.sessions_left !== null) {
        if (s.status === "actif" && left >= 0 && s.sessions_left <= 1)
          hits.push({ signal: "pack", points: 12, text: s.sessions_left ? "Plus qu'une séance sur son pack" : "Pack de séances épuisé", entityId: s.entity_id, extra: s.name });
        continue;
      }
      if (left >= 0 && left <= 14 && !s.auto_renew && s.status !== "suspendu")
        hits.push({ signal: "abo_bientot", points: left <= 7 ? 25 : 18, text: left === 0 ? `Abonnement « ${s.name} » expire aujourd'hui` : `Abonnement « ${s.name} » expire dans ${left} j (${shortDate(s.end_date)}), non renouvelé`, entityId: s.entity_id, extra: s.name });
      else if (left < 0 && left >= -45)
        hits.push({ signal: "abo_expire", points: 30, text: `Abonnement « ${s.name} » expiré depuis ${-left} j, non renouvelé`, entityId: s.entity_id, extra: s.name });
      else if (s.status === "suspendu" && left >= 0) hits.push({ signal: "suspendu", points: 10, text: `Abonnement « ${s.name} » suspendu`, entityId: s.entity_id, extra: s.name });
    }

    if (a) {
      /* Baisse de fréquentation vs sa propre moyenne */
      if (a.first) {
        const span = Math.min(90, diffDays(a.first > d120 ? a.first : d120, d30));
        if (span >= 30) {
          const base = (a.baseline / span) * 30;
          if (base >= 2 && a.recent < base * 0.6) {
            hits.push({
              signal: "frequentation",
              points: Math.round(30 * (1 - a.recent / base)),
              text: `Fréquentation en baisse : ${a.recent} visite${a.recent > 1 ? "s" : ""} en 30 j contre ${fr.format(base)}/mois avant`,
              entityId: null,
            });
          }
        }
      }

      /* Inactivité au regard de son rythme habituel */
      if (a.last) {
        const since = diffDays(a.last, today);
        const n = a.visitDays.size;
        const interval = n >= 2 && a.first ? diffDays(a.first, a.last) / (n - 1) : 30;
        const expected = Math.max(21, interval * 2.5);
        if (since > expected) hits.push({ signal: "inactif", points: Math.min(25, Math.round(10 + (since - expected) / 3)), text: `Aucune visite depuis ${since} j`, entityId: null });
      } else if (hasLiveSub) {
        hits.push({ signal: "inactif", points: 20, text: "Abonné(e) mais aucune visite récente", entityId: null });
      }

      /* Absences répétées */
      if (a.absences >= 2 || a.absences + a.cancels >= 3) {
        const parts = [a.absences ? `${a.absences} absence${a.absences > 1 ? "s" : ""}` : "", a.cancels ? `${a.cancels} annulation${a.cancels > 1 ? "s" : ""}` : ""].filter(Boolean);
        hits.push({ signal: "absences", points: Math.min(20, a.absences * 8 + a.cancels * 3), text: `${parts.join(" et ")} de RDV en 90 j`, entityId: a.absEntity });
      }

      /* Impayé */
      if (a.due > 0.5) hits.push({ signal: "impaye", points: a.due > 1000 ? 20 : 15, text: `Impayé de ${fr.format(a.due)} MAD`, entityId: a.dueEntity, extra: String(Math.round(a.due)) });

      /* Avis négatif */
      if (a.review && a.review.rating <= 3) {
        const neg = a.review.rating <= 2;
        const pts = neg ? (a.review.handled ? 10 : 25) : a.review.handled ? 5 : 12;
        hits.push({ signal: "avis", points: pts, text: `Avis ${neg ? "négatif" : "mitigé"} (${a.review.rating}/5) le ${shortDate(a.review.day)}${a.review.handled ? ", traité" : ""}`, entityId: a.review.entityId });
      }
    }

    if (!hits.length) continue;

    /* Ancienneté : les nouveaux clients sont plus fragiles, les fidèles plus solides */
    const since = (a?.first && a.first < c.created_at.slice(0, 10) ? a.first : c.created_at.slice(0, 10)) || today;
    const tenure = diffDays(since, today);
    let bonus = 0;
    if (tenure < 90) {
      bonus = 8;
      hits.push({ signal: "recent", points: 8, text: `Client récent (${Math.max(1, Math.round(tenure / 30))} mois) : période fragile`, entityId: null });
    } else if (tenure > 365) bonus = -10;

    const score = Math.max(0, Math.min(100, hits.reduce((x, h) => x + h.points, 0) + (bonus < 0 ? bonus : 0)));
    const level = scoreLevel(score);
    if (!level) continue;

    hits.sort((x, y) => y.points - x.points);
    const main = hits[0]!;
    const entityId = pickEntity(main.entityId, hits, a, c.entity_ids, scope);
    if (!entityId) continue;

    const { action, waText } = suggest(main, c.full_name, entityId);
    rows.push({
      contactId: c.id,
      name: c.full_name,
      phone: c.phone,
      entityId,
      score,
      level,
      reasons: hits.map((h) => h.text),
      main: main.signal,
      value12: Math.round(a?.value12 ?? 0),
      lastVisit: a?.last ?? null,
      action,
      waText,
    });
  }

  rows.sort((x, y) => y.score - x.score || y.value12 - x.value12);
  return rows;
}

function pickEntity(main: string | null, hits: Hit[], a: Agg | undefined, entityIds: string[], scope: Set<string>) {
  if (main && scope.has(main)) return main;
  const fromHit = hits.find((h) => h.entityId && scope.has(h.entityId))?.entityId;
  if (fromHit) return fromHit;
  if (a?.visitsByEntity.size) {
    let best: string | null = null;
    let n = -1;
    for (const [e, k] of a.visitsByEntity) if (k > n && scope.has(e)) [best, n] = [e, k];
    if (best) return best;
  }
  return entityIds.find((e) => scope.has(e)) ?? null;
}

function suggest(main: Hit, fullName: string, entityId: string): { action: ChurnAction; waText: string } {
  const e = entity(entityId);
  const where = e?.short ?? "Moov'Up";
  const hi = `Bonjour ${firstName(fullName)},`;
  const visit = e?.kind === "sport" ? "séance" : "rendez-vous";
  switch (main.signal) {
    case "abo_bientot":
    case "abo_expire":
    case "pack":
    case "suspendu":
      return {
        action: { kind: "renouveler", label: "Offre de renouvellement" },
        waText: `${hi} votre ${main.signal === "pack" ? "pack" : "abonnement"} « ${main.extra ?? ""} » chez ${where} ${main.signal === "abo_expire" ? "est arrivé à échéance" : "arrive bientôt à échéance"}. Nous vous proposons de le renouveler avec une attention fidélité. Voulez-vous que l'on prépare votre renouvellement ?`,
      };
    case "impaye":
      return {
        action: { kind: "appeler", label: "Appeler (solde à régler)" },
        waText: `${hi} petit rappel amical : il reste ${fr.format(Number(main.extra ?? 0))} MAD à régler chez ${where}. Vous pouvez passer à l'accueil quand cela vous arrange. Merci et à bientôt !`,
      };
    case "avis":
      return {
        action: { kind: "appeler", label: "Appeler (suite à l'avis)" },
        waText: `${hi} merci pour votre avis sur ${where}. Nous sommes désolés que votre expérience n'ait pas été à la hauteur. Pouvons-nous vous appeler pour en parler et vous proposer une solution ?`,
      };
    case "absences":
      return {
        action: { kind: "appeler", label: "Appeler" },
        waText: `${hi} nous avons remarqué que vos derniers ${visit}s chez ${where} n'ont pas pu avoir lieu. Voulez-vous que l'on vous propose un créneau qui vous convient mieux ?`,
      };
    default:
      return {
        action: { kind: "relancer", label: "Appeler" },
        waText: `${hi} vous nous manquez chez ${where} ! Nous serions ravis de vous revoir : voulez-vous réserver votre prochain${visit === "séance" ? "e" : ""} ${visit} ?`,
      };
  }
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
