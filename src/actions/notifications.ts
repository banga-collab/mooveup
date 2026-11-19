"use server";

import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDaysKey, agadirToIso, dayKey, mad } from "@/lib/utils";
import { DEFAULT_ALERT_QTY, type StockSetting } from "@/lib/types-ops";
import type { Appointment, CatalogItem, Contact, Lead, Sale, Subscription, Task } from "@/lib/types";
import type { CashSession } from "@/lib/types-finance";
import type { Review } from "@/lib/types-loyalty";
import type { OnlineBooking } from "@/lib/types-access";
import type { AppNotification, NotificationKind } from "@/lib/types-shell";

/** Signature courte d'une liste d'identifiants (une nouvelle donnée = une nouvelle notification non lue) */
function sig(ids: string[]) {
  let h = 5381;
  for (const c of [...ids].sort().join(",")) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

/** « Salma B., Yassine K. +2 » */
function names(ids: (string | null)[], contacts: Map<string, Contact>) {
  const list = [...new Set(ids.filter(Boolean) as string[])].map((id) => contacts.get(id)?.full_name).filter(Boolean) as string[];
  const short = list.slice(0, 2).map((n) => {
    const [first, ...rest] = n.split(/\s+/);
    return rest.length ? `${first} ${rest[rest.length - 1]![0]}.` : first!;
  });
  return short.join(", ") + (list.length > 2 ? ` +${list.length - 2}` : "");
}

/**
 * Notifications calculées à la volée pour le périmètre de l'utilisateur.
 * Une notification regroupe les éléments d'une même catégorie (ex. « 3 RDV de demain non confirmés »).
 */
export async function getNotifications(): Promise<AppNotification[]> {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const tomorrow = addDaysKey(today, 1);
  const desk = me.role !== "staff";
  const mgmt = me.role === "direction" || me.role === "manager";
  const ids = scope.ids;
  const none = Promise.resolve({ data: [] as never[] });
  const old = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [appts, items, settings, cash, subs, unpaid, reviews, tasks, bookings, leads, complaints] = await Promise.all([
    supabase.from("appointments").select("*").in("entity_id", ids).eq("status", "prevu").gte("starts_at", agadirToIso(tomorrow, "00:00")).lt("starts_at", agadirToIso(addDaysKey(tomorrow, 1), "00:00")),
    desk ? supabase.from("catalog_items").select("*").in("entity_id", ids).eq("kind", "produit").eq("active", true) : none,
    desk ? supabase.from("stock_settings").select("*").in("entity_id", ids) : none,
    desk ? supabase.from("cash_sessions").select("*").in("entity_id", ids).eq("day", today).eq("status", "cloturee") : none,
    desk ? supabase.from("subscriptions").select("*").in("entity_id", ids).eq("status", "actif").gte("end_date", today).lte("end_date", addDaysKey(today, 3)) : none,
    desk ? supabase.from("sales").select("*").in("entity_id", ids).in("status", ["impayee", "partielle"]).lt("sold_at", old) : none,
    desk ? supabase.from("reviews").select("*").in("entity_id", ids).lte("rating", 3).eq("handled", false) : none,
    supabase.from("tasks").select("*").in("entity_id", ids).eq("done", false).lt("due_date", today),
    desk ? supabase.from("online_bookings").select("*").in("entity_id", ids).eq("status", "nouvelle").gte("starts_at", new Date().toISOString()) : none,
    desk ? supabase.from("leads").select("*").in("entity_id", ids).in("stage", ["nouveau", "contacte", "essai", "offre"]).lte("next_action_on", today) : none,
    desk ? supabase.from("complaints").select("id, entity_id, status, kind").in("entity_id", ids).eq("status", "nouvelle") : none,
  ]);

  const A = (appts.data ?? []) as Appointment[];
  const S = (subs.data ?? []) as Subscription[];
  const U = (unpaid.data ?? []) as Sale[];
  const R = ((reviews.data ?? []) as Review[]).filter((r) => r.rating !== null);
  const T = ((tasks.data ?? []) as Task[]).filter((t) => me.role === "staff" ? t.assigned_to === me.id || !t.assigned_to : true);
  const B = (bookings.data ?? []) as OnlineBooking[];
  const L = (leads.data ?? []) as Lead[];
  const C = ((cash.data ?? []) as CashSession[]).filter((c) => Math.abs(Number(c.difference_mad ?? 0)) >= 1);
  const alertOf = new Map(((settings.data ?? []) as StockSetting[]).map((s) => [s.item_id, Number(s.alert_qty)]));
  const low = ((items.data ?? []) as CatalogItem[]).filter((i) => Math.max(0, Number(i.stock ?? 0)) <= (alertOf.get(i.id) ?? DEFAULT_ALERT_QTY));

  const contactIds = [...new Set([...A, ...S, ...U, ...R, ...L].map((x) => x.contact_id).filter(Boolean) as string[])].slice(0, 400);
  const { data: cRows } = contactIds.length ? await supabase.from("contacts").select("*").in("id", contactIds) : { data: [] };
  const contacts = new Map(((cRows ?? []) as Contact[]).map((c) => [c.id, c]));

  const out: Omit<AppNotification, "read">[] = [];
  const push = (kind: NotificationKind, tone: "alert" | "info", rows: { id: string }[], titleKey: string, detail: string, href: string) => {
    if (rows.length) out.push({ key: `${kind}:${today}:${sig(rows.map((r) => r.id))}`, kind, tone, count: rows.length, titleKey, detail, href });
  };

  push("caisse", "alert", C, "notif.caisse", C.map((c) => `${mad(Number(c.difference_mad))}`).join(" · "), C.length === 1 ? `/cloture/${C[0]!.id}` : "/cloture");
  push("rdv", "alert", A, "notif.rdv", names(A.map((a) => a.contact_id), contacts), `/agenda?date=${tomorrow}`);
  push("reservation", "alert", B, "notif.reservation", B.slice(0, 2).map((b) => b.full_name).join(", ") + (B.length > 2 ? ` +${B.length - 2}` : ""), "/acces");
  const Q = (complaints.data ?? []) as { id: string; kind?: string }[];
  push("reclamation", "alert", Q, "notif.reclamation", `${Q.length} à traiter`, "/reclamations");
  push("avis", "alert", R, "notif.avis", names(R.map((r) => r.contact_id), contacts), "/avis");
  push("stock", "alert", low, "notif.stock", low.slice(0, 2).map((i) => i.name).join(", ") + (low.length > 2 ? ` +${low.length - 2}` : ""), "/stock");
  push("abonnement", "info", S, "notif.abonnement", names(S.map((s) => s.contact_id), contacts), "/abonnements?filtre=expire-bientot");
  if (mgmt || desk) push("impaye", "alert", U, "notif.impaye", `${mad(U.reduce((a, s) => a + Math.max(0, Number(s.total_mad) - Number(s.paid_mad)), 0))} · ${names(U.map((s) => s.contact_id), contacts)}`, "/ventes?statut=impayee");
  push("tache", "info", T, "notif.tache", T.slice(0, 2).map((t) => t.title).join(" · ") + (T.length > 2 ? ` +${T.length - 2}` : ""), "/taches");
  push("prospect", "info", L, "notif.prospect", names(L.map((l) => l.contact_id), contacts), "/prospects");

  const keys = out.map((n) => n.key);
  const { data: reads } = keys.length ? await supabase.from("notification_reads").select("*").eq("user_id", me.id).in("key", keys) : { data: [] };
  const read = new Set(((reads ?? []) as { key: string }[]).map((r) => r.key));
  return out.map((n) => ({ ...n, read: read.has(n.key) }));
}

/** Marque des notifications comme lues pour le membre connecté */
export async function markNotificationsRead(keys: string[]) {
  const clean = [...new Set(keys.filter((k) => typeof k === "string" && k.length < 120))].slice(0, 50);
  if (!clean.length) return;
  const me = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("notification_reads").select("*").eq("user_id", me.id).in("key", clean);
  const known = new Set(((data ?? []) as { key: string }[]).map((r) => r.key));
  const rows = clean.filter((k) => !known.has(k)).map((key) => ({ user_id: me.id, key, read_at: new Date().toISOString() }));
  if (rows.length) await supabase.from("notification_reads").insert(rows);
}
