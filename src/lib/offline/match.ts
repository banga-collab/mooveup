/**
 * Contrôle d'accès sans réseau, à partir de l'instantané local.
 * Mêmes règles de recherche que le poste en ligne (code de carte, téléphone, nom).
 */
import type { DeskHit, DeskResult, DeskVerdict } from "@/actions/access";
import type { AccessCode } from "@/lib/access";
import { dayKey, daysUntil, fmtTime } from "@/lib/utils";
import { parseCode } from "@/components/access/code";
import { phoneDigits } from "@/components/contacts/helpers";
import type { AccessSnapshot, QueuedCheckin, SnapMember, SnapVerdict } from "./types";

const RANK: Record<AccessCode, number> = { ok_sub: 0, ok_rdv: 1, ok_pack: 2, impaye: 3, suspendu: 4, pack_vide: 5, expire: 6, futur: 7, aucun: 8, pas_rdv: 9 };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const hit = (m: SnapMember): DeskHit => ({ id: m.id, full_name: m.name, phone: m.phone || null, entity_ids: m.ents });

/** Recherche hors ligne : un client → verdict, plusieurs → choix */
export function findOffline(snap: AccessSnapshot, query: string): { kind: "none" } | { kind: "one"; member: SnapMember; scan: boolean } | { kind: "many"; hits: DeskHit[] } {
  const q = query.trim();
  const code = parseCode(q);
  if (code) {
    const m = snap.members.find((x) => x.code === code);
    return m ? { kind: "one", member: m, scan: true } : { kind: "none" };
  }
  const digits = q.replace(/\D/g, "");
  let hits: SnapMember[];
  if (digits.length >= 4 && digits.length >= q.replace(/\s/g, "").length - 1) {
    const d = phoneDigits(q);
    const exact = snap.members.filter((m) => m.phone === d);
    hits = exact.length ? exact : snap.members.filter((m) => m.phone.includes(digits));
  } else {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    hits = snap.members.filter((m) => {
      const n = norm(m.name);
      return tokens.every((t) => n.includes(t));
    });
    const exact = hits.filter((m) => norm(m.name) === norm(q));
    if (exact.length === 1) hits = exact;
  }
  if (!hits.length) return { kind: "none" };
  if (hits.length === 1) return { kind: "one", member: hits[0]!, scan: false };
  return { kind: "many", hits: hits.sort((a, b) => a.name.localeCompare(b.name, "fr")).slice(0, 8).map(hit) };
}

/** Le verdict de l'instantané, corrigé si l'instantané date d'un autre jour ou si des séances ont déjà été prises hors ligne */
function adjust(v: SnapVerdict, snap: AccessSnapshot, used: number, today: string): SnapVerdict {
  if (!v.ok) return v;
  if (v.code === "ok_rdv" && snap.day !== today) return { ...v, ok: false, code: "pas_rdv", reason: "Pas de rendez-vous aujourd'hui" };
  if (v.until && v.until < today) return { ...v, ok: false, code: "expire", reason: "Abonnement expiré" };
  if (v.code === "ok_pack" && v.sessions !== null) {
    const left = v.sessions - used;
    if (left <= 0) return { ...v, ok: false, code: "pack_vide", reason: "Pack terminé : plus aucune séance", sessions: 0 };
    return { ...v, sessions: left };
  }
  return v;
}

/** Verdict hors ligne et entrée à mettre en file (si autorisée et pas déjà entrée) */
export function verdictOffline(
  snap: AccessSnapshot,
  member: SnapMember,
  queue: QueuedCheckin[],
  method: "qr" | "recherche",
): { result: DeskResult; entry: QueuedCheckin | null } {
  const today = dayKey();
  const since = snap.at;
  const verdicts = member.v
    .map((v) => adjust(v, snap, queue.filter((q) => q.contact_id === member.id && q.entity_id === v.e && q.at > since).length, today))
    .sort((a, b) => RANK[a.code] - RANK[b.code]);
  const v = verdicts[0];
  if (!v) return { result: { kind: "error", message: "Aucun établissement à contrôler." }, entry: null };

  const recent = queue.filter((q) => q.contact_id === member.id && q.entity_id === v.e && Date.now() - new Date(q.at).getTime() < 3 * 3600_000).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const at = new Date().toISOString();
  const verdict: DeskVerdict = {
    contact: { id: member.id, full_name: member.name, phone: member.phone || null },
    ok: v.ok,
    forced: false,
    code: v.code,
    entity_id: v.e,
    reason: v.reason,
    plan: v.plan,
    daysLeft: v.until ? daysUntil(v.until) : null,
    sessionsLeft: v.ok && v.code === "ok_pack" && v.sessions !== null && !recent ? v.sessions - 1 : v.sessions,
    sessionUsed: v.ok && v.code === "ok_pack" && !recent,
    already: recent ? fmtTime(recent.at) : null,
    at,
    canForce: false,
    hints: null,
    offline: true,
  };
  const entry: QueuedCheckin | null =
    v.ok && !recent ? { id: `${member.id}:${v.e}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`, contact_id: member.id, name: member.name, entity_id: v.e, method, at, desk: snap.desk } : null;
  return { result: { kind: "result", v: verdict }, entry };
}
