"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDirection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings, type Settings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { parseNum, str } from "@/lib/utils";
import type { FormState } from "@/components/action-form";

const LABELS: Partial<Record<keyof Settings, string>> = {
  company_name: "raison sociale",
  address: "adresse",
  phone: "téléphone",
  email: "e-mail",
  ice: "ICE",
  rc: "RC",
  if_number: "IF",
  patente: "patente",
  vat_rate: "TVA",
  invoice_footer: "pied de facture",
  google_review_url: "lien avis Google",
  loyalty_points_per_10mad: "points fidélité",
  loyalty_point_value_mad: "valeur du point",
  referral_bonus_points: "bonus parrainage",
  whatsapp_phone_id: "WhatsApp Phone ID",
  whatsapp_enabled: "activation WhatsApp",
  cmi_client_id: "CMI Client ID",
  cmi_enabled: "activation CMI",
  booking_deposit_mad: "acompte de réservation",
};

const text = (fd: FormData, k: string, max = 200) => (str(fd.get(k)) ?? "").slice(0, max);

/** Enregistre les réglages du groupe (ligne unique id = 1) */
export async function saveSettings(_state: FormState, fd: FormData): Promise<FormState> {
  const me = await requireDirection();
  const before = await getSettings();

  const company_name = text(fd, "company_name", 120);
  if (!company_name) return { error: "La raison sociale est obligatoire." };
  const email = text(fd, "email", 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "L'adresse e-mail n'est pas valide." };
  const ice = text(fd, "ice", 20).replace(/\s/g, "");
  if (ice && !/^\d{15}$/.test(ice)) return { error: "L'ICE doit contenir exactement 15 chiffres." };

  const vat = parseNum(fd.get("vat_rate"));
  if (vat === null || vat < 0 || vat > 30) return { error: "Le taux de TVA doit être compris entre 0 et 30 %." };
  const pts = parseNum(fd.get("loyalty_points_per_10mad"));
  const ptValue = parseNum(fd.get("loyalty_point_value_mad"));
  const referral = parseNum(fd.get("referral_bonus_points"));
  const deposit = parseNum(fd.get("booking_deposit_mad"));
  if (pts === null || pts < 0 || pts > 100) return { error: "Points par tranche de 10 MAD : entre 0 et 100." };
  if (ptValue === null || ptValue < 0 || ptValue > 100) return { error: "Valeur d'un point : entre 0 et 100 MAD." };
  if (referral === null || referral < 0 || referral > 100_000) return { error: "Bonus de parrainage invalide." };
  if (deposit === null || deposit < 0 || deposit > 100_000) return { error: "Acompte de réservation invalide." };

  const review = text(fd, "google_review_url", 300);
  if (review && !/^https:\/\//.test(review)) return { error: "Le lien d'avis Google doit commencer par https://" };

  const whatsapp_phone_id = text(fd, "whatsapp_phone_id", 40).replace(/\s/g, "");
  const whatsapp_enabled = fd.get("whatsapp_enabled") === "on";
  if (whatsapp_enabled && !whatsapp_phone_id) return { error: "Renseignez le Phone ID WhatsApp avant d'activer l'envoi." };
  const cmi_client_id = text(fd, "cmi_client_id", 60).replace(/\s/g, "");
  const cmi_enabled = fd.get("cmi_enabled") === "on";
  if (cmi_enabled && !cmi_client_id) return { error: "Renseignez le Client ID CMI avant d'activer le paiement en ligne." };

  const row: Settings = {
    id: 1,
    company_name,
    address: text(fd, "address", 200),
    phone: text(fd, "phone", 40),
    email,
    ice,
    rc: text(fd, "rc", 40),
    if_number: text(fd, "if_number", 40),
    patente: text(fd, "patente", 40),
    vat_rate: Math.round(vat * 100) / 100,
    invoice_footer: text(fd, "invoice_footer", 400),
    google_review_url: review,
    loyalty_points_per_10mad: Math.round(pts * 100) / 100,
    loyalty_point_value_mad: Math.round(ptValue * 100) / 100,
    referral_bonus_points: Math.round(referral),
    whatsapp_phone_id,
    whatsapp_enabled,
    cmi_client_id,
    cmi_enabled,
    booking_deposit_mad: Math.round(deposit * 100) / 100,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert(row);
  if (error) return { error: "Impossible d'enregistrer les paramètres." };

  const changed = (Object.keys(LABELS) as (keyof Settings)[]).filter((k) => String(before[k]) !== String(row[k])).map((k) => LABELS[k]!);
  if (changed.length) {
    await logAudit({
      action: "parametres.modification",
      entity_id: null,
      target_type: "settings",
      target_id: "1",
      summary: `Paramètres modifiés : ${changed.join(", ")}`,
      actor: me,
      meta: { fields: changed },
    });
  }
  await flash(changed.length ? "Paramètres enregistrés" : "Aucune modification", changed.length ? "success" : "info");
  revalidatePath("/", "layout");
  redirect(`/parametres?ok=${Date.now().toString(36)}`);
}
