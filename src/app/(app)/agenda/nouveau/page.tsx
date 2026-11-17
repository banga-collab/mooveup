import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { entity, type EntityId } from "@/lib/entities";
import { dayKey } from "@/lib/utils";
import { saveAppointmentPlus } from "@/actions/agenda-plus";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { AppointmentForm } from "@/components/agenda/appointment-form";
import { loadAppointmentFormData } from "@/components/agenda/form-data";

export const metadata = { title: "Nouveau rendez-vous" };

/** Prochaine demi-heure à Agadir (entre 08:00 et 20:30) */
function nextSlot() {
  const t = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Casablanca" }).format(new Date());
  let m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  m = Math.ceil((m + 1) / 30) * 30;
  m = Math.min(Math.max(m, 8 * 60), 20 * 60 + 30);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<{ contact?: string; date?: string; heure?: string; staff?: string }> }) {
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : dayKey();
  const time = sp.heure && /^\d{2}:\d{2}$/.test(sp.heure) ? sp.heure : date === dayKey() ? nextSlot() : "09:00";
  const data = await loadAppointmentFormData(scope, { extraContactId: sp.contact ?? null, aroundDate: date });
  const staffOk = sp.staff && data.staff.some((s) => s.id === sp.staff) ? sp.staff : null;
  // Établissement proposé : celui du client (de préférence institut, clinique ou barbier, où l'on prend rendez-vous)
  let contactEntity: EntityId | undefined;
  if (sp.contact && !scope.current) {
    const { data: c } = await (await createClient()).from("contacts").select("entity_ids").eq("id", sp.contact).maybeSingle();
    const ids = ((c as { entity_ids?: EntityId[] } | null)?.entity_ids ?? []).filter((e) => scope.allowed.some((a) => a.id === e));
    contactEntity = ids.find((e) => entity(e)?.kind !== "sport") ?? ids[0];
  }
  const entityId = scope.current?.id ?? contactEntity ?? (staffOk ? data.staff.find((s) => s.id === staffOk)?.entity_ids.find((e) => scope.allowed.some((a) => a.id === e)) : undefined) ?? scope.allowed[0]?.id ?? null;
  const back = sp.contact ? `/contacts/${sp.contact}` : `/agenda?date=${date}`;

  return (
    <div>
      <PageHeader title="Nouveau rendez-vous" subtitle="Réservez une prestation pour un client" back={<BackLink href={back} label={sp.contact ? "Retour à la fiche" : "Retour à l'agenda"} />} />
      <AppointmentForm
        action={saveAppointmentPlus}
        {...data}
        cancelHref={back}
        defaults={{
          contact_id: sp.contact ?? null,
          entity_id: entityId,
          item_id: null,
          service: "",
          staff_id: staffOk,
          date,
          time,
          duration_min: 60,
          price_mad: 0,
          room: "",
          notes: "",
        }}
      />
    </div>
  );
}
