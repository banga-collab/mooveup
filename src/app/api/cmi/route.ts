import { createHash, timingSafeEqual } from "node:crypto";
import { publicDb } from "@/lib/access";

/**
 * Rappel serveur-à-serveur du CMI après paiement de l'acompte d'une réservation en ligne.
 * Vérifie la signature (hash « ver3 »), puis passe la réservation en « acompte payé ».
 * Le CMI attend une réponse texte : ACTION=POSTAUTH (accepté) ou FAILURE.
 */
export async function POST(req: Request) {
  const storeKey = process.env.CMI_STORE_KEY;
  if (!storeKey) return new Response("FAILURE", { status: 503 });

  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") params[k] = v;
  });

  // Signature : mêmes règles que l'aller (paramètres triés, sans hash/encoding, + clé du magasin)
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  const keys = Object.keys(params)
    .filter((k) => !["hash", "encoding"].includes(k.toLowerCase()))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const plain = `${keys.map((k) => esc(params[k]!)).join("|")}|${esc(storeKey)}`;
  const expected = createHash("sha512").update(plain, "utf8").digest("base64");
  const received = params.HASH ?? params.hash ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("FAILURE", { status: 400 });

  const ok = params.ProcReturnCode === "00" && /approved/i.test(params.Response ?? "");
  if (!ok || !params.oid) return new Response("APPROVED");

  const db = publicDb();
  await db.from("online_bookings").update({ deposit_status: "paye" }).eq("ref", params.oid);
  return new Response("ACTION=POSTAUTH");
}
