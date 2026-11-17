import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  Filter,
  ListChecks,
  Receipt,
  ShoppingCart,
  Users,
} from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ENTITIES, entity } from "@/lib/entities";
import { byId, lastMonths, monthKey } from "@/lib/data";
import { APPT_STATUS_LABEL, STAGES, addDaysKey, agadirHour, agadirToIso, cn, dayKey, daysUntil, fmtTime, mad, madShort, pct } from "@/lib/utils";
import type { Appointment, Contact, Lead, Sale, Subscription, Task } from "@/lib/types";
import { SolidTile, ShortcutTile } from "@/components/stat-tile";
import { Avatar, Card, CardHeader, Empty } from "@/components/ui";
import { EntityBadge, EntityIcon, EntityMark } from "@/components/entity-icon";

export const metadata = { title: "Tableau de bord" };

export default async function Dashboard() {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const months = lastMonths(7);
  const from = `${months[0]!.key}-01`;

  const [{ data: salesRaw }, { data: apptRaw }, { data: subsRaw }, { data: leadsRaw }, { data: tasksRaw }, { count: clientsCount }, { count: newContacts }] = await Promise.all([
    supabase.from("sales").select("*").in("entity_id", scope.ids).gte("sold_at", agadirToIso(from, "00:00")),
    supabase.from("appointments").select("*").in("entity_id", scope.ids).gte("starts_at", agadirToIso(today, "00:00")).lt("starts_at", agadirToIso(addDaysKey(today, 1), "00:00")).order("starts_at"),
    supabase.from("subscriptions").select("*").in("entity_id", scope.ids).eq("status", "actif"),
    supabase.from("leads").select("*").in("entity_id", scope.ids),
    supabase.from("tasks").select("*").in("entity_id", scope.ids).eq("done", false).lte("due_date", today).order("due_date"),
    supabase.from("contacts").select("id", { count: "exact", head: true }).overlaps("entity_ids", scope.ids).eq("status", "client"),
    supabase.from("contacts").select("id", { count: "exact", head: true }).overlaps("entity_ids", scope.ids).gte("created_at", addDaysKey(today, -30)),
  ]);
  const sales = ((salesRaw ?? []) as Sale[]).filter((s) => s.status !== "remboursee");
  const appts = (apptRaw ?? []) as Appointment[];
  const subs = (subsRaw ?? []) as Subscription[];
  const leads = (leadsRaw ?? []) as Lead[];
  const tasks = (tasksRaw ?? []) as Task[];

  // Contacts utiles à l'affichage
  const contactIds = [...new Set([...appts.map((a) => a.contact_id), ...subs.map((s) => s.contact_id)])];
  const { data: contactRows } = await supabase.from("contacts").select("*").in("id", contactIds);
  const contacts = byId(contactRows as Contact[]);

  /* Chiffre d'affaires */
  const thisMonth = months.at(-1)!.key;
  const prevMonth = months.at(-2)!.key;
  const revenueBy = (m: string, eid?: string) => sales.filter((s) => monthKey(s.sold_at) === m && (!eid || s.entity_id === eid)).reduce((a, s) => a + Number(s.total_mad), 0);
  const revMonth = revenueBy(thisMonth);
  // Comparaison à date égale avec le mois précédent
  const dom = Number(today.slice(8, 10));
  const revPrevSameDay = sales.filter((s) => monthKey(s.sold_at) === prevMonth && Number(dayKey(s.sold_at).slice(8, 10)) <= dom).reduce((a, s) => a + Number(s.total_mad), 0);
  const revTrend = revPrevSameDay ? Math.round(((revMonth - revPrevSameDay) / revPrevSameDay) * 100) : null;
  const revToday = sales.filter((s) => dayKey(s.sold_at) === today).reduce((a, s) => a + Number(s.total_mad), 0);
  const unpaid = sales.filter((s) => s.status === "impayee" || s.status === "partielle").reduce((a, s) => a + Number(s.total_mad) - Number(s.paid_mad), 0);

  /* Rendez-vous du jour */
  const live = appts.filter((a) => a.status !== "annule");
  const nowMs = Date.now();
  const nextAppt = live.find((a) => new Date(a.starts_at).getTime() + a.duration_min * 60000 > nowMs && a.status !== "termine" && a.status !== "absent");

  /* Prospects */
  const open = leads.filter((l) => !["gagne", "perdu"].includes(l.stage));
  const won30 = leads.filter((l) => l.stage === "gagne" && l.updated_at >= addDaysKey(today, -30)).length;
  const closed30 = leads.filter((l) => (l.stage === "gagne" || l.stage === "perdu") && l.updated_at >= addDaysKey(today, -30)).length;
  const toFollow = open.filter((l) => l.next_action_on && l.next_action_on <= today).length;

  /* Abonnements qui expirent */
  const expiring = subs
    .filter((s) => {
      const d = daysUntil(s.end_date);
      return d >= 0 && d <= 7;
    })
    .sort((a, b) => (a.end_date < b.end_date ? -1 : 1));

  const hour = agadirHour();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const first = (me.full_name || "").split(" ")[0];
  const showEntities = !scope.current && scope.allowed.length > 1;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <p className="text-sm font-semibold capitalize text-muted">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Casablanca" }).format(new Date())}</p>
          <h1 className="mt-1 font-display text-[28px] font-extrabold tracking-tight sm:text-[34px]">
            {hello}, <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">{first}</span> <span className="inline-block origin-[70%_70%] animate-[wave_2.2s_ease-in-out_1]">👋</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {scope.current ? (
              <>
                Vue <b style={{ color: scope.current.color }}>{scope.current.name}</b> · {scope.current.tagline}
              </>
            ) : (
              <>Vue groupe · {scope.allowed.length} établissements</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/caisse" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-accent-500 px-4 text-sm font-bold text-white shadow-lg shadow-accent-500/25 transition hover:bg-accent-600">
            <ShoppingCart className="size-4" /> Encaisser
          </Link>
          <Link href="/agenda/nouveau" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-bold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600">
            <CalendarDays className="size-4" /> Rendez-vous
          </Link>
        </div>
      </div>

      {/* Tuiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SolidTile
          tone="brand"
          href="/rapports"
          label="CA du mois"
          value={madShort(revMonth)}
          sub={`Aujourd'hui : ${mad(revToday)}`}
          icon={<CircleDollarSign />}
          watermark={<CircleDollarSign />}
          trendLabel={revTrend === null ? undefined : `${revTrend > 0 ? "+" : ""}${revTrend} %`}
          trendUp={revTrend === null || revTrend === 0 ? null : revTrend > 0}
          series={months.map((m) => revenueBy(m.key))}
        />
        <SolidTile
          tone="accent"
          href="/contacts?statut=client"
          label="Clients actifs"
          value={clientsCount ?? 0}
          sub={`${newContacts ?? 0} nouveaux contacts en 30 j`}
          icon={<Users />}
          watermark={<Users />}
          trendLabel={`${subs.length} abonnements`}
          trendUp={null}
        />
        <SolidTile
          tone="brand"
          href="/agenda"
          label="Rendez-vous aujourd'hui"
          value={live.length}
          sub={nextAppt ? `Prochain à ${fmtTime(nextAppt.starts_at)} · ${nextAppt.service}` : "Plus de rendez-vous aujourd'hui"}
          icon={<CalendarDays />}
          watermark={<CalendarDays />}
          trendLabel={`${live.filter((a) => a.status === "arrive" || a.status === "termine").length} accueillis`}
          trendUp={null}
        />
        <SolidTile
          tone="accent"
          href="/prospects"
          label="Prospects en cours"
          value={open.length}
          sub={`${toFollow} à relancer aujourd'hui`}
          icon={<Filter />}
          watermark={<Filter />}
          trendLabel={closed30 ? `${pct(won30, closed30)} % convertis` : undefined}
          trendUp={closed30 ? won30 / closed30 >= 0.5 : null}
        />
      </div>

      {/* Raccourcis */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ShortcutTile href="/taches" icon={<ListChecks className="size-5" />} label="Tâches à faire" hint="Échues ou pour aujourd'hui" value={tasks.length} hot={tasks.length > 0} />
        <ShortcutTile href="/abonnements?filtre=expire-bientot" icon={<AlarmClock className="size-5" />} label="Abonnements à renouveler" hint="Fin dans 7 jours ou moins" value={expiring.length} hot={expiring.length > 0} />
        <ShortcutTile href="/ventes?statut=impayee" icon={<Receipt className="size-5" />} label="Reste à encaisser" hint="Ventes impayées ou partielles" value={madShort(unpaid)} hot={unpaid > 0} />
        <ShortcutTile href="/abonnements" icon={<CreditCard className="size-5" />} label="Abonnements actifs" hint="Tous établissements du périmètre" value={subs.length} />
      </div>

      {/* Établissements */}
      {showEntities && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-extrabold">Nos établissements</h2>
            <Link href="/etablissements" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-500 hover:underline">
              Tout voir <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {scope.allowed.map((e) => {
              const rev = revenueBy(thisMonth, e.id);
              const prev = revenueBy(prevMonth, e.id);
              const rdv = live.filter((a) => a.entity_id === e.id).length;
              const actives = subs.filter((s) => s.entity_id === e.id).length;
              return (
                <Link
                  key={e.id}
                  href={`/etablissements/${e.id}`}
                  className="group relative overflow-hidden rounded-3xl p-4 text-white shadow-lg transition duration-200 hover:-translate-y-1 hover:shadow-xl"
                  style={{ background: `linear-gradient(135deg, ${e.color}, ${e.color}cc)` }}
                >
                  <span className="pointer-events-none absolute -bottom-5 -right-5 text-white/15 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6">
                    <EntityIcon id={e.id} className="size-28" />
                  </span>
                  <div className="relative flex items-center gap-2.5">
                    <span className="grid size-10 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30">
                      <EntityIcon id={e.id} className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-[15px] font-bold">{e.short}</p>
                      <p className="truncate text-[11px] text-white/80">{e.tagline}</p>
                    </div>
                  </div>
                  <p className="relative mt-4 font-display text-2xl font-extrabold">{mad(rev)}</p>
                  <p className="relative text-[11px] font-semibold uppercase tracking-wide text-white/80">CA du mois · {prev ? `${Math.round((rev / prev) * 100)} % du mois dernier` : "nouveau"}</p>
                  <div className="relative mt-3 flex gap-2 text-[11px] font-semibold">
                    <span className="rounded-full bg-white/20 px-2 py-0.5">{rdv} RDV aujourd&apos;hui</span>
                    {e.kind === "sport" && <span className="rounded-full bg-white/20 px-2 py-0.5">{actives} abonnés</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        {/* Chiffre d'affaires sur 7 mois */}
        <Card>
          <CardHeader title="Chiffre d'affaires" subtitle="7 derniers mois, par établissement" icon={<CircleDollarSign className="size-4" />} />
          <RevenueBars
            months={months.map((m) => ({
              label: m.label,
              parts: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ id: e.id, color: e.color, value: revenueBy(m.key, e.id) })),
            }))}
          />
        </Card>

        {/* Entonnoir des prospects */}
        <Card>
          <CardHeader
            title="Prospects"
            subtitle={`${open.length} en cours · ${mad(open.reduce((a, l) => a + Number(l.value_mad), 0))} potentiels`}
            icon={<Filter className="size-4" />}
            action={
              <Link href="/prospects" className="text-sm font-semibold text-brand-500 hover:underline">
                Pipeline
              </Link>
            }
          />
          <div className="space-y-2.5 px-5 pb-5">
            {STAGES.map((s) => {
              const n = leads.filter((l) => l.stage === s.id).length;
              const max = Math.max(1, ...STAGES.map((x) => leads.filter((l) => l.stage === x.id).length));
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="w-[150px] shrink-0 truncate text-[13px] font-medium text-slate-600">{s.label}</span>
                  <span className="relative h-7 flex-1 overflow-hidden rounded-lg bg-canvas">
                    <span className="absolute inset-y-0 left-0 rounded-lg transition-all" style={{ width: `${Math.max(4, (n / max) * 100)}%`, background: s.tone }} />
                  </span>
                  <span className="w-7 text-right font-display text-sm font-extrabold" style={{ color: s.tone }}>
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {/* Rendez-vous du jour */}
        <Card>
          <CardHeader
            title="Rendez-vous du jour"
            subtitle={`${live.length} prévus`}
            icon={<Clock className="size-4" />}
            action={
              <Link href="/agenda" className="text-sm font-semibold text-brand-500 hover:underline">
                Agenda
              </Link>
            }
          />
          {live.length ? (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto px-2 pb-3">
              {live.map((a) => {
                const c = contacts.get(a.contact_id);
                const isNext = nextAppt?.id === a.id;
                const done = a.status === "termine" || a.status === "absent";
                return (
                  <li key={a.id}>
                    <Link href={`/contacts/${a.contact_id}`} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-canvas", done && "opacity-55")}>
                      <span className="w-12 shrink-0 text-center">
                        <span className={cn("block font-display text-sm font-extrabold", isNext ? "text-accent-500" : "text-ink")}>{fmtTime(a.starts_at)}</span>
                        <span className="block text-[10.5px] text-muted">{a.duration_min} min</span>
                      </span>
                      <span className="relative">
                        <EntityMark id={a.entity_id} size={34} />
                        {isNext && <span className="absolute -right-0.5 -top-0.5 size-3 animate-ping rounded-full bg-accent-500" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{c?.full_name ?? "Client"}</span>
                        <span className="block truncate text-xs text-muted">
                          {a.service}
                          {a.room ? ` · ${a.room}` : ""}
                        </span>
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", a.status === "arrive" ? "bg-emerald-50 text-emerald-700" : a.status === "confirme" ? "bg-brand-50 text-brand-600" : a.status === "termine" ? "bg-slate-100 text-slate-500" : a.status === "absent" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700")}>
                        {APPT_STATUS_LABEL[a.status]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={<CalendarDays className="size-6" />} title="Aucun rendez-vous aujourd'hui" text="Les rendez-vous de l'institut, de la clinique et du barbier apparaîtront ici." />
          )}
        </Card>

        {/* Abonnements à renouveler */}
        <Card>
          <CardHeader
            title="À renouveler cette semaine"
            subtitle="Abonnements qui se terminent dans 7 jours"
            icon={<AlarmClock className="size-4" />}
            action={
              <Link href="/abonnements?filtre=expire-bientot" className="text-sm font-semibold text-brand-500 hover:underline">
                Tout voir
              </Link>
            }
          />
          {expiring.length ? (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto px-2 pb-3">
              {expiring.map((s) => {
                const c = contacts.get(s.contact_id);
                const d = daysUntil(s.end_date);
                return (
                  <li key={s.id}>
                    <Link href={`/contacts/${s.contact_id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-canvas">
                      <Avatar name={c?.full_name ?? "?"} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{c?.full_name ?? "Client"}</span>
                        <span className="block truncate text-xs text-muted">{s.name}</span>
                      </span>
                      <span className="hidden sm:block">
                        <EntityBadge id={s.entity_id} />
                      </span>
                      <span className={cn("w-[74px] rounded-full px-2 py-0.5 text-center text-[11px] font-bold", d <= 2 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700")}>
                        {d === 0 ? "Aujourd'hui" : d === 1 ? "Demain" : `${d} jours`}
                      </span>
                      <ChevronRight className="size-4 text-slate-300" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={<CreditCard className="size-6" />} title="Rien à renouveler" text="Aucun abonnement ne se termine dans les 7 prochains jours." />
          )}
        </Card>
      </div>
    </div>
  );
}

/** Barres empilées du CA mensuel (SVG/CSS, sans librairie) */
function RevenueBars({ months }: { months: { label: string; parts: { id: string; color: string; value: number }[] }[] }) {
  const totals = months.map((m) => m.parts.reduce((a, p) => a + p.value, 0));
  const max = Math.max(1, ...totals);
  const ids = months[0]?.parts.map((p) => p.id) ?? [];
  return (
    <div className="px-5 pb-5">
      <div className="flex h-56 items-end gap-2 sm:gap-4">
        {months.map((m, i) => (
          <div key={m.label + i} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className={cn("text-[11px] font-bold", i === months.length - 1 ? "text-accent-600" : "text-slate-500")}>{madShort(totals[i]!)}</span>
            <div className="flex w-full max-w-[56px] flex-col-reverse overflow-hidden rounded-xl transition group-hover:brightness-110" style={{ height: `${(totals[i]! / max) * 100}%`, minHeight: 4 }}>
              {m.parts.map((p) => (
                <span key={p.id} title={`${entity(p.id)?.short} : ${mad(p.value)}`} style={{ height: `${totals[i] ? (p.value / totals[i]!) * 100 : 0}%`, background: p.color }} />
              ))}
            </div>
            <span className={cn("text-xs font-semibold capitalize", i === months.length - 1 ? "text-ink" : "text-muted")}>{m.label}</span>
          </div>
        ))}
      </div>
      {ids.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
          {ids.map((id) => {
            const e = ENTITIES.find((x) => x.id === id)!;
            return (
              <span key={id} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <span className="size-2.5 rounded-sm" style={{ background: e.color }} />
                {e.short}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
