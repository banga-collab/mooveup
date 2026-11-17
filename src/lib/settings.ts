import { cache } from "react";
import { createClient } from "./supabase/server";

/** Réglages du groupe (une seule ligne, id = 1, table `settings`) */
export type Settings = {
  id: number;
  company_name: string;
  address: string;
  phone: string;
  email: string;
  /** Identifiant commun de l'entreprise (Maroc) */
  ice: string;
  rc: string;
  if_number: string;
  patente: string;
  /** TVA en % appliquée sur les factures (prix saisis TTC) */
  vat_rate: number;
  invoice_footer: string;
  /** Lien Google pour laisser un avis */
  google_review_url: string;
  /** Fidélité : points gagnés par tranche de 10 MAD, valeur d'un point en MAD */
  loyalty_points_per_10mad: number;
  loyalty_point_value_mad: number;
  referral_bonus_points: number;
  /** WhatsApp Business (Cloud API) */
  whatsapp_phone_id: string;
  whatsapp_enabled: boolean;
  /** Paiement en ligne CMI */
  cmi_client_id: string;
  cmi_enabled: boolean;
  /** Acompte demandé à la réservation en ligne (MAD, 0 = aucun) */
  booking_deposit_mad: number;
  updated_at: string;
};

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  company_name: "Groupe Moov'Up",
  address: "N°40 Hay El Mohammadi, Agadir",
  phone: "05 28 00 00 00",
  email: "contact@moovup.ma",
  ice: "",
  rc: "",
  if_number: "",
  patente: "",
  vat_rate: 20,
  invoice_footer: "Merci de votre visite !",
  google_review_url: "",
  loyalty_points_per_10mad: 1,
  loyalty_point_value_mad: 0.5,
  referral_bonus_points: 200,
  whatsapp_phone_id: "",
  whatsapp_enabled: false,
  cmi_client_id: "",
  cmi_enabled: false,
  booking_deposit_mad: 0,
  updated_at: new Date(0).toISOString(),
};

/** Réglages courants (valeurs par défaut si la ligne n'existe pas encore) */
export const getSettings = cache(async (): Promise<Settings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...((data as Partial<Settings> | null) ?? {}) };
});
