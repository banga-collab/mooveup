import { notFound } from "next/navigation";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isoToAgadir } from "@/lib/utils";
import { saveAppointmentPlus } from "@/actions/agenda-plus";
import { REPEAT_LABEL, type AppointmentSeries, type SeriesAppointment } from "@/lib/types-agenda";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { AppointmentForm } from "@/components/agenda/appointment-form";
import { loadAppointmentFormData } from "@/components/agenda/form-data";

export const metadata = { title: "Modifier le rendez-vous" };

export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  const supabase = await createClient();
  const { data: row } = await supabase.from("appointments").select("*").eq("id", id).in("entity_id", scope.allowed.map((e) => e.id)).maybeSingle();
  const appt = row as SeriesAppointment | null;
  if (!appt) notFound();
  let series: AppointmentSeries | null = null;
  if (appt.series_id) {
    const { data } = await supabase.from("appointment_series").select("*").eq("id", appt.series_id).maybeSingle();
    series = data as AppointmentSeries | null;
  }

  const { date, time } = isoToAgadir(appt.starts_at);
  const data = await loadAppointmentFormData(scope, { extraContactId: appt.contact_id, aroundDate: date });
  const back = `/agenda?date=${date}&sel=${appt.id}`;

  return (
    <div>
      <PageHeader title="Modifier le rendez-vous" subtitle={appt.service} back={<BackLink href={back} label="Retour à l'agenda" />} />
      <AppointmentForm
        action={saveAppointmentPlus}
        {...data}
        cancelHref={back}
        defaults={{
          id: appt.id,
          contact_id: appt.contact_id,
          entity_id: appt.entity_id,
          item_id: appt.item_id && data.items.some((i) => i.id === appt.item_id) ? appt.item_id : null,
          service: appt.service,
          staff_id: appt.staff_id,
          date,
          time,
          duration_min: appt.duration_min,
          price_mad: Number(appt.price_mad),
          room: appt.room ?? "",
          notes: appt.notes ?? "",
          status: appt.status,
          series_id: appt.series_id ?? null,
          series_label: series ? REPEAT_LABEL[series.freq].toLowerCase() : null,
        }}
      />
    </div>
  );
}
