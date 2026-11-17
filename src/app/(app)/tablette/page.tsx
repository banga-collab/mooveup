import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getTeam } from "@/lib/data";
import { entity } from "@/lib/entities";
import { getLang } from "@/lib/i18n";
import { LangProvider } from "@/lib/i18n/client";
import { agadirToIso, dayKey } from "@/lib/utils";
import type { Appointment, Contact } from "@/lib/types";
import type { Checkin } from "@/lib/types-access";
import { TabletShell, type TabletAppt, type TabletEntry } from "@/components/tablet/tablet-shell";

export const metadata = { title: "Tablette accueil" };

/** Mode tablette de l'accueil : plein écran, grandes cibles, scanner permanent, FR / AR */
export default async function TabletPage() {
  const [scope, lang] = await Promise.all([getScope(), getLang()]);
  const supabase = await createClient();
  const desk = scope.current ? scope.current.id : "auto";
  const deskIds = scope.ids;
  const deskLabel = scope.current ? scope.current.short : deskIds.length === 1 ? (entity(deskIds[0])?.short ?? "") : "";

  const today = dayKey();
  const [{ data: rows }, { data: apptRows }, team] = await Promise.all([
    supabase.from("checkins").select("*").in("entity_id", deskIds).gte("created_at", agadirToIso(today, "00:00")).order("created_at", { ascending: false }).limit(60),
    supabase.from("appointments").select("*").in("entity_id", deskIds).gte("starts_at", agadirToIso(today, "00:00")).lt("starts_at", agadirToIso(today, "23:59")).order("starts_at"),
    getTeam(scope),
  ]);
  const checkins = (rows ?? []) as Checkin[];
  const appts = ((apptRows ?? []) as Appointment[]).filter((a) => a.status !== "annule");
  const ids = [...new Set([...checkins.map((c) => c.contact_id), ...appts.map((a) => a.contact_id)])];
  const { data: contactRows } = ids.length ? await supabase.from("contacts").select("id, full_name").in("id", ids) : { data: [] };
  const people = byId((contactRows ?? []) as Pick<Contact, "id" | "full_name">[]);
  const staff = byId(team);

  const entries: TabletEntry[] = checkins.map((c) => ({
    id: c.id,
    name: people.get(c.contact_id)?.full_name ?? "",
    entity_id: c.entity_id,
    at: c.created_at,
    forced: c.forced,
    session: c.session_used,
  }));
  const agenda: TabletAppt[] = appts.map((a) => ({
    id: a.id,
    contact_id: a.contact_id,
    name: people.get(a.contact_id)?.full_name ?? "",
    service: a.service,
    at: a.starts_at,
    status: a.status,
    entity_id: a.entity_id,
    staff: a.staff_id ? (staff.get(a.staff_id)?.full_name ?? null) : null,
  }));

  return (
    <LangProvider lang={lang}>
      <TabletShell desk={desk} deskLabel={deskLabel} multi={deskIds.length > 1} entries={entries} agenda={agenda} />
    </LangProvider>
  );
}
