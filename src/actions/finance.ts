"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo";
import { entity, type EntityId } from "@/lib/entities";
import { logAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { dayKey, fmtDate, mad, parseNum, str } from "@/lib/utils";
import type { FormState } from "@/components/action-form";
import { computeCashDay, expectedCash } from "@/components/finance/cash-day";
import {
  CASH_TOLERANCE,
  DENOMINATIONS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_METHOD_LABEL,
  type CashSession,
  type Expense,
  type ExpenseCategory,
  type ExpenseMethod,
} from "@/lib/types-finance";

const r2 = (n: number) => Math.round(n * 100) / 100;
const stamp = () => Date.now().toString(36);

/* ---------- Caisse ---------- */

/** Ouvre la caisse du jour avec le fond de caisse */
export async function openCashSession(_state: FormState, fd: FormData): Promise<FormState> {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role === "staff") return { error: "La caisse est réservée à la direction, aux managers et à la réception." };
  const entityId = str(fd.get("entity_id")) as EntityId | null;
  if (!entityId || !scope.allowed.some((e) => e.id === entityId)) return { error: "Établissement non autorisé." };
  const float = parseNum(fd.get("opening_float"));
  if (float === null || float < 0 || float > 100_000) return { error: "Indiquez le fond de caisse (0 si la caisse est vide)." };

  const supabase = await createClient();
  const today = dayKey();
  const { data: existing } = await supabase.from("cash_sessions").select("id").eq("entity_id", entityId).eq("day", today).maybeSingle();
  if (existing) return { error: "La caisse de cet établissement est déjà ouverte aujourd'hui." };

  const { data, error } = await supabase
    .from("cash_sessions")
    .insert({
      entity_id: entityId,
      day: today,
      status: "ouverte",
      opening_float_mad: r2(float),
      opened_at: new Date().toISOString(),
      opened_by: me.id,
      closed_at: null,
      closed_by: null,
      expected_cash_mad: null,
      counted_cash_mad: null,
      difference_mad: null,
      comment: null,
      breakdown: null,
      totals: null,
    })
    .select()
    .single();
  if (error || !data) return { error: "Impossible d'ouvrir la caisse. Réessayez." };
  const session = data as CashSession;

  await logAudit({
    action: "caisse.ouverture",
    entity_id: entityId,
    target_type: "cash_session",
    target_id: session.id,
    summary: `Caisse ${entity(entityId)?.short ?? ""} ouverte avec un fond de ${mad(float)}`,
    actor: me,
    meta: { float: r2(float) },
  });
  await flash(`Caisse ouverte · fond de ${mad(float)}`);
  revalidatePath("/cloture");
  redirect(`/cloture?o=${stamp()}`);
}

/** Clôture la caisse : espèces comptées, écart, commentaire ; la session est ensuite verrouillée */
export async function closeCashSession(id: string, _state: FormState, fd: FormData): Promise<FormState> {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role === "staff") return { error: "La caisse est réservée à la direction, aux managers et à la réception." };
  const supabase = await createClient();
  const { data } = await supabase.from("cash_sessions").select("*").eq("id", id).maybeSingle();
  const session = data as CashSession | null;
  if (!session || !scope.allowed.some((e) => e.id === session.entity_id)) return { error: "Caisse introuvable." };
  if (session.status === "cloturee") return { error: "Cette caisse est déjà clôturée." };

  const counted = parseNum(fd.get("counted"));
  if (counted === null || counted < 0) return { error: "Indiquez le montant des espèces comptées." };

  const breakdown: Record<string, number> = {};
  for (const d of DENOMINATIONS) {
    const n = Math.round(parseNum(fd.get(`d${d}`)) ?? 0);
    if (n > 0) breakdown[String(d)] = n;
  }

  const totals = await computeCashDay(supabase, session.entity_id, session.day);
  const expected = expectedCash(Number(session.opening_float_mad), totals);
  const diff = r2(counted - expected);
  const comment = str(fd.get("comment"));
  if (Math.abs(diff) > CASH_TOLERANCE && !comment) {
    return { error: `Écart de ${diff > 0 ? "+" : ""}${mad(diff)} : expliquez-le dans le commentaire avant de clôturer.` };
  }

  const { data: updated } = await supabase
    .from("cash_sessions")
    .update({
      status: "cloturee",
      closed_at: new Date().toISOString(),
      closed_by: me.id,
      expected_cash_mad: expected,
      counted_cash_mad: r2(counted),
      difference_mad: diff,
      comment: comment ? comment.slice(0, 1000) : null,
      breakdown: Object.keys(breakdown).length ? breakdown : null,
      totals,
    })
    .eq("id", id)
    .eq("status", "ouverte")
    .select();
  if (!updated || !(updated as unknown[]).length) return { error: "Impossible de clôturer la caisse (déjà clôturée ?)." };

  const label = diff === 0 ? "sans écart" : `écart ${diff > 0 ? "+" : ""}${mad(diff)}`;
  await logAudit({
    action: "caisse.cloture",
    entity_id: session.entity_id,
    target_type: "cash_session",
    target_id: session.id,
    summary: `Caisse ${entity(session.entity_id)?.short ?? ""} du ${fmtDate(session.day)} clôturée : attendu ${mad(expected)}, compté ${mad(counted)} (${label})`,
    actor: me,
    meta: { expected, counted: r2(counted), diff },
  });
  await flash(`Caisse clôturée · ${label}`, Math.abs(diff) > CASH_TOLERANCE ? "info" : "success");
  revalidatePath("/cloture");
  redirect(`/cloture/${session.id}`);
}

/* ---------- Dépenses ---------- */

const EXPENSE_METHODS = Object.keys(EXPENSE_METHOD_LABEL) as ExpenseMethod[];

/** Justificatif : data URL en démo, bucket « justificatifs » en production */
async function storeReceipt(file: File, entityId: string, date: string): Promise<string | null> {
  if (!file.size) return null;
  if (!file.type.startsWith("image/")) return null;
  if (DEMO) {
    const buf = Buffer.from(await file.arrayBuffer());
    return `data:${file.type};base64,${buf.toString("base64")}`;
  }
  const supabase = await createClient();
  const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
  const path = `${entityId}/${date}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("justificatifs").upload(path, file, { contentType: file.type });
  if (error) return null;
  return supabase.storage.from("justificatifs").getPublicUrl(path).data.publicUrl;
}

export async function createExpense(_state: FormState, fd: FormData): Promise<FormState> {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role !== "direction" && me.role !== "manager") return { error: "Seules la direction et les managers peuvent saisir des dépenses." };

  const entityId = str(fd.get("entity_id")) as EntityId | null;
  if (!entityId || !scope.allowed.some((e) => e.id === entityId)) return { error: "Choisissez un établissement autorisé." };
  const date = str(fd.get("date")) ?? dayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date invalide." };
  if (date > dayKey()) return { error: "La date ne peut pas être dans le futur." };
  const category = str(fd.get("category")) as ExpenseCategory | null;
  if (!category || !EXPENSE_CATEGORIES.some((c) => c.id === category)) return { error: "Choisissez une catégorie." };
  const amount = parseNum(fd.get("amount"));
  if (amount === null || amount <= 0) return { error: "Indiquez le montant de la dépense." };
  if (amount > 10_000_000) return { error: "Montant trop élevé." };
  const methodRaw = str(fd.get("method")) as ExpenseMethod | null;
  const method: ExpenseMethod = methodRaw && EXPENSE_METHODS.includes(methodRaw) ? methodRaw : "especes";

  const file = fd.get("receipt");
  const receipt_url = file instanceof File ? await storeReceipt(file, entityId, date) : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      entity_id: entityId,
      date,
      category,
      amount_mad: r2(amount),
      method,
      supplier: str(fd.get("supplier"))?.slice(0, 120) ?? null,
      note: str(fd.get("note"))?.slice(0, 500) ?? null,
      receipt_url,
      created_by: me.id,
    })
    .select()
    .single();
  if (error || !data) return { error: "Impossible d'enregistrer la dépense." };
  const exp = data as Expense;

  await logAudit({
    action: "depense.ajout",
    entity_id: entityId,
    target_type: "expense",
    target_id: exp.id,
    summary: `Dépense ${EXPENSE_CATEGORY_LABEL[category]} de ${mad(amount)}${exp.supplier ? ` (${exp.supplier})` : ""} · ${EXPENSE_METHOD_LABEL[method]}`,
    actor: me,
    meta: { amount: r2(amount), method, month: date.slice(0, 7) },
  });
  await flash(`Dépense de ${mad(amount)} enregistrée`);
  revalidatePath("/depenses");
  revalidatePath("/cloture");
  redirect(`/depenses?month=${date.slice(0, 7)}&ok=${stamp()}`);
}

export async function deleteExpense(id: string) {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role !== "direction" && me.role !== "manager") redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.from("expenses").select("*").eq("id", id).maybeSingle();
  const exp = data as Expense | null;
  if (!exp || !scope.allowed.some((e) => e.id === exp.entity_id)) redirect("/depenses");
  await supabase.from("expenses").delete().eq("id", id);
  await logAudit({
    action: "depense.suppression",
    entity_id: exp.entity_id,
    target_type: "expense",
    target_id: null,
    summary: `Dépense supprimée : ${EXPENSE_CATEGORY_LABEL[exp.category] ?? exp.category} de ${mad(Number(exp.amount_mad))} du ${fmtDate(exp.date)}${exp.supplier ? ` (${exp.supplier})` : ""}`,
    actor: me,
    meta: { amount: Number(exp.amount_mad), month: exp.date.slice(0, 7) },
  });
  await flash("Dépense supprimée");
  revalidatePath("/depenses");
  revalidatePath("/cloture");
  redirect(`/depenses?month=${exp.date.slice(0, 7)}&ok=${stamp()}`);
}
