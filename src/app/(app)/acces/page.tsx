import Link from "next/link";
import { CalendarCheck, ExternalLink, LogIn } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import { entity } from "@/lib/entities";
import { BOOKABLE, hourlyStats } from "@/lib/access";
import { agadirHour, agadirToIso, addDaysKey, dayKey, fmtDate, fmtTime } from "@/lib/utils";
import type { Contact } from "@/lib/types";
import type { Checkin, OnlineBooking } from "@/lib/types-access";
import { Avatar, Badge, Card, CardHeader, Empty, LinkButton, PageHeader, Segmented } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { AccessDesk } from "@/components/access/desk";
import { AutoRefresh } from "@/components/access/auto-refresh";
import { HourlyChart } from "@/components/access/hourly-chart";
import { SubmitButton } from "@/components/submit-button";
import { confirmOnlineBooking } from "@/actions/booking";
import { ListToolbar } from "@/components/list-toolbar";
import { ContactLink } from "@/components/quick-view/contact-link";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { NoResults, clearHref, readSort, sortRows } from "@/components/reports/list-kit";

const DAYS = [
  { value: "hier", label: "Hier" },
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
];
const FILTERS = ["q", "jour", "type", "tri"];

export const metadata = { title: "Accueil & entrées" };

export default async function AccessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();

  // Poste d'accueil : établissement choisi dans le sélecteur, ou ?e=, ou « tous »
  const desk = scope.current ? scope.current.id : sp.e && scope.ids.includes(sp.e as never) ? sp.e : "auto";
  const deskIds = desk === "auto" ? scope.ids : [desk as (typeof scope.ids)[number]];
  const deskLabel = desk === "auto" ? (scope.ids.length > 1 ? "tous les établissements" : entity(scope.ids[0])?.short ?? "") : entity(desk)?.short ?? "";

  const today = dayKey();
  const since = agadirToIso(addDaysKey(today, -30), "00:00");
  const [{ data: rows }, { data: bookingRows }] = await Promise.all([
    supabase.from("checkins").select("*").in("entity_id", deskIds).gte("created_at", since).order("created_at", { ascending: false }),
    supabase.from("online_bookings").select("*").in("entity_id", deskIds).eq("status", "nouvelle").gte("starts_at", new Date().toISOString()).order("starts_at").limit(5),
  ]);
  const checkins = (rows ?? []) as Checkin[];
  const bookings = (bookingRows ?? []) as OnlineBooking[];
  const todays = checkins.filter((c) => dayKey(c.created_at) === today);
  // Entrées du jour + historique (30 jours) : recherche et filtres
  const q = one(sp.q);
  const jour = DAYS.some((d) => d.value === one(sp.jour)) ? one(sp.jour)! : "";
  const fType = one(sp.type);
  const sort = readSort(sp, ["heure", "nom"] as const, "heure", "desc");
  const periodRows =
    jour === "hier" ? checkins.filter((c) => dayKey(c.created_at) === addDaysKey(today, -1)) : jour ? checkins.filter((c) => dayKey(c.created_at) >= addDaysKey(today, -Number(jour))) : todays;
  const listIds = [...new Set(periodRows.map((c) => c.contact_id))];
  const present = new Set(todays.map((c) => c.contact_id)).size;
  const forced = todays.filter((c) => c.forced).length;

  const { data: contactRows } = listIds.length ? await supabase.from("contacts").select("id, full_name, phone").in("id", listIds) : { data: [] };
  const people = byId((contactRows ?? []) as Pick<Contact, "id" | "full_name" | "phone">[]);
  const typeOk = (c: Checkin) => !fType || (fType === "forcee" ? c.forced : fType === "seance" ? c.session_used : fType === "rdv" ? c.method === "rdv" : true);
  const matched = periodRows.filter((c) => typeOk(c) && matchesQuery(q, people.get(c.contact_id)?.full_name, people.get(c.contact_id)?.phone, entity(c.entity_id)?.short));
  const latest = sortRows(matched, (c) => (sort.key === "nom" ? (people.get(c.contact_id)?.full_name ?? "") : c.created_at), sort.dir).slice(0, 150);
  const listFiltered = FILTERS.some((k) => !!one(sp[k]));
  const severalDays = !!jour && jour !== "hier";
  const listTitle = jour === "hier" ? "Entrées d'hier" : jour ? `Entrées · ${jour} derniers jours` : "Entrées du jour";

  const stats = hourlyStats(checkins, today);
  const multi = deskIds.length > 1;
  const bookable = scope.allowed.find((e) => BOOKABLE.includes(e.id) && deskIds.includes(e.id));

  return (
    <div>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Accueil & entrées"
        subtitle={`${fmtDate(new Date(), { weekday: "long", day: "numeric", month: "long" })} · poste : ${deskLabel}`}
        actions={
          <LinkButton href={bookable ? `/reserver?e=${bookable.id}` : "/reserver"} target="_blank" variant="secondary">
            <ExternalLink /> Page de réservation
          </LinkButton>
        }
      />

      {!scope.current && scope.ids.length > 1 && (
        <div className="mb-5">
          <Segmented
            active={desk}
            items={[{ id: "auto", href: "/acces", label: "Tous" }, ...scope.ids.map((id) => ({ id, href: `/acces?e=${id}`, label: entity(id)?.short ?? id }))]}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        <div className="space-y-5">
          <AccessDesk desk={desk} deskLabel={deskLabel} />

          <Card>
            <CardHeader title="Fréquentation par heure" subtitle="Pour anticiper les heures de pointe à l'accueil et en salle" />
            <div className="px-5 pb-5">
              <HourlyChart data={stats} currentHour={agadirHour()} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
              <div className="p-4">
                <p className="text-[13px] text-muted">Présents aujourd&apos;hui</p>
                <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums text-ink">{present}</p>
              </div>
              <div className="p-4">
                <p className="text-[13px] text-muted">Passages</p>
                <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums text-ink">{todays.length}</p>
                {forced > 0 && <p className="mt-1 text-xs text-amber-700">dont {forced} forcé{forced > 1 ? "s" : ""}</p>}
              </div>
            </div>
            <CardHeader
              title={listTitle}
              subtitle={`${matched.length} passage${matched.length > 1 ? "s" : ""}${matched.length > latest.length ? ` · ${latest.length} affichés` : ""}${jour ? "" : " · mise à jour automatique"}`}
              icon={<LogIn />}
            />
            {(checkins.length > 0 || listFiltered) && (
              <div className="px-5">
                <ListToolbar
                  className="mb-3"
                  placeholder="Client, téléphone…"
                  filters={[
                    { param: "jour", label: "Aujourd'hui", options: DAYS },
                    { param: "type", label: "Toutes", options: [{ value: "forcee", label: "Forcées" }, { value: "seance", label: "Séance" }, { value: "rdv", label: "RDV" }] },
                    { param: "tri", label: "Heure", options: [{ value: "nom", label: "Nom" }] },
                  ]}
                />
              </div>
            )}
            {latest.length ? (
              <ul className="max-h-[560px] divide-y divide-line overflow-y-auto border-t border-line">
                {latest.map((c) => {
                  const p = people.get(c.contact_id);
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                      <Avatar name={p?.full_name ?? "?"} size={30} />
                      <span className="min-w-0 flex-1">
                        <ContactLink id={c.contact_id} name={p?.full_name ?? "Client"} className="block truncate text-[13px]" />
                        <span className="flex items-center gap-2">
                          {multi && <EntityBadge id={c.entity_id} />}
                          {c.method === "rdv" && <span className="text-xs text-muted">Rendez-vous</span>}
                        </span>
                      </span>
                      {c.forced && <Badge tone="amber">Forcée</Badge>}
                      {c.session_used && <Badge tone="brand">Séance</Badge>}
                      <span className="text-right text-xs tabular-nums text-muted">
                        {severalDays && dayKey(c.created_at) !== today && (
                          <>
                            {fmtDate(c.created_at, { day: "numeric", month: "short" })}
                            <br />
                          </>
                        )}
                        {fmtTime(c.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="border-t border-line">
                {listFiltered ? (
                  <NoResults q={q} href={clearHref("/acces", sp, FILTERS)} what="passage" />
                ) : (
                  <Empty icon={<LogIn />} title="Aucune entrée pour l'instant" text="Les passages validés apparaissent ici en direct." />
                )}
              </div>
            )}
          </Card>

          {bookings.length > 0 && (
            <Card>
              <CardHeader title="Réservations en ligne à confirmer" icon={<CalendarCheck />} action={<Link href="/taches" className="text-brand-600">Tâches</Link>} />
              <ul className="divide-y divide-line border-t border-line">
                {bookings.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="min-w-0 flex-1">
                      <ContactLink id={b.contact_id} name={b.full_name} className="block truncate text-[13px]" />
                      <span className="block truncate text-xs text-muted">{b.service}</span>
                    </span>
                    <span className="text-right text-xs tabular-nums text-muted">
                      {fmtDate(b.starts_at, { day: "numeric", month: "short" })}
                      <br />
                      {fmtTime(b.starts_at)}
                    </span>
                    <form action={confirmOnlineBooking.bind(null, b.id)}>
                      <SubmitButton variant="secondary" className="h-8 px-2.5" pendingText="…">
                        Confirmer
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
