/**
 * Envoi WhatsApp.
 *  - WhatsApp Cloud API (Meta) si `settings.whatsapp_enabled`, `settings.whatsapp_phone_id`
 *    et la variable d'environnement `WHATSAPP_TOKEN` sont renseignés ;
 *  - sinon mode « lien wa.me » : le message est préparé et journalisé, l'équipe
 *    l'envoie à la main en un clic ; en démo, l'envoi est simulé.
 * Chaque message est journalisé dans `message_log`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Settings } from "./settings";
import type { AutomationKey, MessageLog, MessageMode, MessageStatus } from "./types-loyalty";
import { DEMO } from "./demo";
import { dayKey, waLink } from "./utils";

export type SendResult = { status: MessageStatus; mode: MessageMode; error: string | null; waId: string | null };

/** Numéro international sans « + » (06… → 2126…) */
export function waNumber(phone: string | null | undefined) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "212" + d.slice(1);
  return d.length >= 9 ? d : null;
}

/** Mode d'envoi actuel (pour l'affichage) */
export function whatsappMode(settings: Pick<Settings, "whatsapp_enabled" | "whatsapp_phone_id">): MessageMode {
  if (DEMO) return "demo";
  return settings.whatsapp_enabled && settings.whatsapp_phone_id && process.env.WHATSAPP_TOKEN ? "api" : "lien";
}

/** Envoie un message texte (sans journaliser) */
export async function sendWhatsApp(phone: string | null, body: string, settings: Settings): Promise<SendResult> {
  const to = waNumber(phone);
  const mode = whatsappMode(settings);
  if (!to) return { status: "echec", mode, error: "Numéro de téléphone invalide", waId: null };
  if (mode !== "api") return { status: "simule", mode, error: null, waId: null };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(settings.whatsapp_phone_id)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: true, body } }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok) return { status: "echec", mode, error: json.error?.message?.slice(0, 300) ?? `Erreur ${res.status}`, waId: null };
    return { status: "envoye", mode, error: null, waId: json.messages?.[0]?.id ?? null };
  } catch (e) {
    return { status: "echec", mode, error: e instanceof Error ? e.message.slice(0, 300) : "Erreur réseau", waId: null };
  }
}

/** Envoie et journalise dans `message_log` (+ ligne sur la fiche client) */
export async function sendAndLog(
  supabase: SupabaseClient,
  msg: { contact_id: string | null; entity_id: string | null; phone: string | null; body: string; rule_key: AutomationKey | null; ref_id: string | null; author_id: string | null; label?: string },
  settings: Settings,
) {
  const r = await sendWhatsApp(msg.phone, msg.body, settings);
  const row: Omit<MessageLog, "id" | "created_at"> = {
    rule_key: msg.rule_key,
    contact_id: msg.contact_id,
    entity_id: (msg.entity_id as MessageLog["entity_id"]) ?? null,
    phone: msg.phone,
    body: msg.body,
    status: r.status,
    mode: r.mode,
    error: r.error,
    ref_id: msg.ref_id,
    day_key: dayKey(),
    wa_message_id: r.waId,
    author_id: msg.author_id,
  };
  await supabase.from("message_log").insert(row);
  if (msg.contact_id && r.status !== "echec") {
    await supabase.from("activities").insert({
      contact_id: msg.contact_id,
      entity_id: msg.entity_id,
      kind: "whatsapp",
      body: `${msg.label ? `${msg.label} : ` : "WhatsApp : "}${msg.body}`,
      author_id: msg.author_id,
    });
  }
  return r;
}

/** Lien pour (r)envoyer à la main */
export function resendLink(m: Pick<MessageLog, "phone" | "body">) {
  return waLink(m.phone, m.body);
}
