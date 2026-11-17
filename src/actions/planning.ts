"use server";

import { revalidatePath } from "next/cache";
import { allowedEntities, getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { addDaysKey, dayKey, fmtTime, parseNum, str } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import type { CommissionBasis, Shift, ShiftKind, TimeEntry } from "@/lib/types-ops";
import type { FormState } from "@/components/action-form";
import { isDayKey, isTime, mondayOf } from "@/components/planning/lib";

export type PlanState = { error?: string; done?: string; token?: string } | undefined;

const KINDS: ShiftKind[] = ["travail", "repos", "conge"];

async function ctx() {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const manager = me.role === "direction" || me.role === "manager";
  return { me, scope, manager, supabase: await createClient() };
}

const allowedIds = (scope: Awaited<ReturnType<typeof getScope>>) => scope.allowed.map((e) => e.id as string);

/** Ajoute ou modifie un créneau (travail, repos, congé) */
export async function saveShift(_state: PlanState, formData: FormData): Promise<PlanState> {
  const res = await saveShiftInner(formData);
  return { ...res, token: str(formData.get("token")) ?? undefined };
}

async function saveShiftInner(formData: FormData): Promise<{ error?: string; done?: string }> {
  const { me, scope, manager, supabase } = await ctx();
  if (!manager) return { error: "Seuls la direction et les managers modifient le planning." };

  const id = str(formData.get("id"));
  const profileId = str(formData.get("profile_id"));
  const date = str(formData.get("date"));
  const entityId = str(formData.get("entity_id"));
  const kind = (str(formData.get("kind")) ?? "travail") as ShiftKind;
  if (!profileId) return { error: "Choisissez un membre de l'équipe." };
  if (!isDayKey(date)) return { error: "Date invalide." };
  if (!entityId || !allowedIds(scope).includes(entityId)) return { error: "Choisissez un établissement autorisé." };
  if (!KINDS.includes(kind)) return { error: "Type de créneau inconnu." };

  const start = kind === "travail" ? str(formData.get("start_time")) : null;
  const end = kind === "travail" ? str(formData.get("end_time")) : null;
  if (kind === "travail") {
    if (!isTime(start) || !isTime(end)) return { error: "Indiquez l'heure de début et de fin (HH:MM)." };
    if (start === end) return { error: "L'heure de fin doit être différente du début." };
  }

  const { data: member } = await supabase.from("profiles").select("id").eq("id", profileId).maybeSingle();
  if (!member) return { error: "Membre de l'équipe introuvable." };

  const row = { profile_id: profileId, date, entity_id: entityId, kind, start_time: start, end_time: end, note: str(formData.get("note"))?.slice(0, 200) ?? null };
  if (id) {
    const { data } = await supabase.from("shifts").select("*").eq("id", id).maybeSingle();
    const shift = data as Shift | null;
    if (!shift || !allowedIds(scope).includes(shift.entity_id)) return { error: "Créneau introuvable." };
    await supabase.from("shifts").update(row).eq("id", id);
  } else {
    // Repos / congé remplacent ce qui était prévu ce jour-là
    if (kind !== "travail") {
      const { data: same } = await supabase.from("shifts").select("*").eq("profile_id", profileId).eq("date", date);
      const ids = ((same ?? []) as Shift[]).filter((s) => allowedIds(scope).includes(s.entity_id)).map((s) => s.id);
      if (ids.length) await supabase.from("shifts").delete().in("id", ids);
    } else {
      const { data: same } = await supabase.from("shifts").select("*").eq("profile_id", profileId).eq("date", date).neq("kind", "travail");
      const ids = ((same ?? []) as Shift[]).map((s) => s.id);
      if (ids.length) await supabase.from("shifts").delete().in("id", ids);
    }
    await supabase.from("shifts").insert({ ...row, created_by: me.id });
  }

  await flash(id ? "Créneau modifié" : kind === "travail" ? "Créneau ajouté" : kind === "repos" ? "Repos enregistré" : "Congé enregistré");
  revalidatePath("/planning");
  return { done: str(formData.get("token")) ?? "1" };
}

export async function deleteShift(id: string) {
  const { scope, manager, supabase } = await ctx();
  if (!manager) return;
  const { data } = await supabase.from("shifts").select("*").eq("id", id).maybeSingle();
  const shift = data as Shift | null;
  if (!shift || !allowedIds(scope).includes(shift.entity_id)) return;
  await supabase.from("shifts").delete().eq("id", id);
  await flash("Créneau supprimé");
  revalidatePath("/planning");
}

/** Recopie la semaine précédente sur la semaine affichée (sans écraser les jours déjà planifiés) */
export async function copyPreviousWeek(monday: string) {
  const { me, scope, manager, supabase } = await ctx();
  if (!manager || !isDayKey(monday)) return;
  const mon = mondayOf(monday);
  const prevMon = addDaysKey(mon, -7);
  const [{ data: prev }, { data: cur }] = await Promise.all([
    supabase.from("shifts").select("*").in("entity_id", scope.ids).gte("date", prevMon).lte("date", addDaysKey(prevMon, 6)),
    supabase.from("shifts").select("*").gte("date", mon).lte("date", addDaysKey(mon, 6)),
  ]);
  const taken = new Set(((cur ?? []) as Shift[]).map((s) => `${s.profile_id}|${s.date}`));
  const rows = ((prev ?? []) as Shift[])
    .map((s) => ({ ...s, date: addDaysKey(s.date, 7) }))
    .filter((s) => !taken.has(`${s.profile_id}|${s.date}`))
    .map((s) => ({ entity_id: s.entity_id, profile_id: s.profile_id, date: s.date, start_time: s.start_time, end_time: s.end_time, kind: s.kind, note: s.kind === "conge" ? null : s.note, created_by: me.id }));
  if (rows.length) await supabase.from("shifts").insert(rows);
  await flash(rows.length ? `${rows.length} créneau${rows.length > 1 ? "x" : ""} copié${rows.length > 1 ? "s" : ""}` : "Rien à copier : la semaine est déjà planifiée", rows.length ? "success" : "info");
  revalidatePath("/planning");
}

/** Pointer l'arrivée ou le départ (soi-même, ou un membre pour un manager) */
export async function punch(profileId: string | null) {
  const { me, scope, manager, supabase } = await ctx();
  const target = profileId ?? me.id;
  if (target !== me.id && !manager) return;
  const today = dayKey();

  const { data: openRows } = await supabase.from("time_entries").select("*").eq("profile_id", target).eq("date", today).is("clock_out", null);
  const open = ((openRows ?? []) as TimeEntry[])[0];
  const nowIso = new Date().toISOString();
  if (open) {
    await supabase.from("time_entries").update({ clock_out: nowIso }).eq("id", open.id);
    await flash(`Départ pointé à ${fmtTime(nowIso)}`);
  } else {
    // Établissement : celui du créneau du jour, sinon celui choisi en haut, sinon le premier autorisé
    const { data: person } = await supabase.from("profiles").select("*").eq("id", target).maybeSingle();
    if (!person) return;
    const { data: todays } = await supabase.from("shifts").select("*").eq("profile_id", target).eq("date", today).eq("kind", "travail").order("start_time");
    const mine = allowedEntities(person as Profile);
    const allowed = allowedIds(scope);
    const fromShift = ((todays ?? []) as Shift[]).find((s) => allowed.includes(s.entity_id))?.entity_id;
    const entity = fromShift ?? (scope.current && mine.includes(scope.current.id) ? scope.current.id : (mine.find((e) => allowed.includes(e)) ?? allowed[0]));
    if (!entity) return;
    await supabase.from("time_entries").insert({ entity_id: entity, profile_id: target, date: today, clock_in: nowIso, clock_out: null });
    await flash(`Arrivée pointée à ${fmtTime(nowIso)}`);
  }
  revalidatePath("/planning");
}

/* ---------- Commissions ---------- */
const BASES: CommissionBasis[] = ["prestations", "produits"];

export async function saveCommissionRule(_state: FormState, formData: FormData): Promise<FormState> {
  const { scope, manager, supabase } = await ctx();
  if (!manager) return { error: "Réservé à la direction et aux managers." };
  const entityId = str(formData.get("entity_id"));
  if (!entityId || !allowedIds(scope).includes(entityId)) return { error: "Choisissez un établissement autorisé." };
  const basis = str(formData.get("basis")) as CommissionBasis;
  if (!BASES.includes(basis)) return { error: "Choisissez ce qui est commissionné." };
  const rate = parseNum(formData.get("rate_pct"));
  if (rate === null || rate < 0 || rate > 100) return { error: "Indiquez un taux entre 0 et 100 %." };
  const profileId = str(formData.get("profile_id"));
  if (profileId) {
    const { data } = await supabase.from("profiles").select("id").eq("id", profileId).maybeSingle();
    if (!data) return { error: "Membre introuvable." };
  }
  await supabase.from("commission_rules").insert({
    entity_id: entityId,
    profile_id: profileId,
    basis,
    category: str(formData.get("category"))?.slice(0, 80) ?? null,
    rate_pct: Math.round(rate * 100) / 100,
    active: true,
  });
  await flash("Règle de commission ajoutée");
  revalidatePath("/planning");
  return undefined;
}

export async function deleteCommissionRule(id: string) {
  const { scope, manager, supabase } = await ctx();
  if (!manager) return;
  const { data } = await supabase.from("commission_rules").select("*").eq("id", id).maybeSingle();
  if (!data || !allowedIds(scope).includes((data as { entity_id: string }).entity_id)) return;
  await supabase.from("commission_rules").delete().eq("id", id);
  await flash("Règle supprimée");
  revalidatePath("/planning");
}
