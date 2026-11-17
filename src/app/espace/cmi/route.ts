import { createHash, timingSafeEqual } from "node:crypto";
import { publicDb } from "@/lib/access";
import { dayKey, mad } from "@/lib/utils";
import type { MemberRequest } from "@/lib/types-member";

/**
 * Rappel serveur-à-serveur du CMI après le paiement d'un renouvellement depuis l'espace adhérent.
 * Vérifie la signature (hash « ver3 »), passe la demande en « payé » et prévient l'accueil.
 * Réponse attendue par le CMI : ACTION=POSTAUTH (accepté) ou FAILURE.
 */
export async function POST(req: Request) {
  const storeKey = process.env.CMI_STORE_KEY;
  if (!storeKey) return new Response("FAILURE", { status: 503 });

  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") params[k] = v;
  });

  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  const keys = Object.keys(params)
    .filter((k) => !["hash", "encoding"].includes(k.toLowerCase()))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const plain = `${keys.map((k) => esc(params[k]!)).join("|")}|${esc(storeKey)}`;
  const expected = Buffer.from(createHash("sha512").update(plain, "utf8").digest("base64"));
  const received = Buffer.from(params.HASH ?? params.hash ?? "");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return new Response("FAILURE", { status: 400 });

  const ok = params.ProcReturnCode === "00" && /approved/i.test(params.Response ?? "");
  if (!ok || !params.oid) return new Response("APPROVED");

  const db = publicDb();
  const { data } = await db.from("member_requests").select("*").eq("ref", params.oid).maybeSingle();
  const r = data as MemberRequest | null;
  if (r && r.status === "a_payer") {
    await db.from("member_requests").update({ status: "paye" }).eq("id", r.id);
    await Promise.all([
      db.from("activities").insert({ contact_id: r.contact_id, entity_id: r.entity_id, kind: "vente", body: `Paiement en ligne CMI reçu (${r.ref}) : ${r.label}, ${mad(r.amount_mad)}`, author_id: null }),
      db.from("tasks").insert({
        title: `Paiement en ligne reçu : enregistrer la vente et activer « ${r.label} » (${mad(r.amount_mad)})`,
        contact_id: r.contact_id,
        lead_id: null,
        entity_id: r.entity_id,
        assigned_to: null,
        due_date: dayKey(),
        priority: "haute",
        done: false,
        created_by: null,
      }),
    ]);
  }
  return new Response("ACTION=POSTAUTH");
}
