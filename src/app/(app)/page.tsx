import Link from "next/link";
import { AlarmClock, CalendarCheck, CalendarDays, CircleDollarSign, Filter, ListChecks, Receipt, ShoppingCart, Users } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { entity } from "@/lib/entities";
import { byId, lastMonths, monthKey } from "@/lib/data";
import { APPT_STATUS_LABEL, addDaysKey, agadirHour, agadirToIso, cn, dayKey, fmtTime, mad, madShort, pct } from "@/lib/utils";
import type { Appointment, AppointmentStatus, Contact, Lead, Sale, Subscription } from "@/lib/types";
import { SolidTile, ShortcutTile } from "@/components/stat-tile";
import { Badge, Card, CardHeader, Empty, LinkButton, tableClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";

export const metadata = { title: "Tableau de bord" };

const STATUS_TONE: Record<AppointmentStatus, "amber" | "brand" | "green" | "gray" | "red"> = {
  prevu: "amber",
  confirme: "brand",
  arrive: "green",
  termine: "gray",
  absent: "red",
  annule: "gray",
};

const linkCls = "rounded text-[13px] font-medium text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40";

export default async function Dashboard() {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const tomorrow = addDaysKey(today, 1);
  const in7 = addDaysKey(today, 7);
  const months = lastMonths(7);
  const from = `${months[0]!.key}-01`;

  const [{ data: salesRaw }, { data: apptRaw }, { data: subsRaw }, { data: leadsRaw }, { count: tasksDue }, { count: clientsCount }, { count: newContacts }] = await Promise.all([
    supabase.from("sales").select("*").in("entity_id", scope.ids).gte("sold_at", agadirToIso(from, "00:00")),
    // Aujourd'hui et demain (demain : pour les RDV à confirmer)
    supabase.from("appointments").select("*").in("entity_id", scope.ids).gte("starts_at", agadirToIso(today, "00:00")).lt("starts_at", agadirToIso(addDaysKey(today, 2), "00:00")).order("starts_at"),
    supabase.from("subscriptions").select("*").in("entity_id", scope.ids).eq("status", "actif"),
    supabase.from("leads").select("*").in("entity_id", scope.ids),
    supabase.from("tasks").select("id", { count: "exact", head: true }).in("entity_id", scope.ids).eq("done", false).lte("due_date", today),
    supabase.from("contacts").select("id", { count: "exact", head: true }).overlaps("entity_ids", scope.ids).eq("status", "client"),
    supabase.from("contacts").select("id", { count: "exact", head: true }).overlaps("entity_ids", scope.ids).gte("created_at", addDaysKey(today, -30)),
  ]);
  const appts2d = ((apptRaw ?? []) as Appointment[]).filter((a) => a.status !== "annule");
  const subs = (subsRaw ?? []) as Subscription[];
  const leads = (leadsRaw ?? []) as Lead[];

  /* ---------- Chiffre d'affaires : un seul passage sur les ventes ---------- */
  const thisMonth = months.at(-1)!.key;
  const prevMonth = months.at(-2)!.key;
  const dom = Number(today.slice(8, 10));
  const rev = new Map<string, number>(); // clés "AAAA-MM" et "AAAA-MM|entité"
  const prevSameDay = new Map<string, number>(); // mois précédent à date égale : "*" et par entité
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  let revToday = 0;
  let unpaid = 0;
  for (const s of (salesRaw ?? []) as Sale[]) {
    if (s.status === "remboursee") continue;
    const total = Number(s.total_mad);
    const day = dayKey(s.sold_at);
    const m = monthKey(s.sold_at);
    add(rev, m, total);
    add(rev, `${m}|${s.entity_id}`, total);
    if (m === prevMonth && Number(day.slice(8, 10)) <= dom) {
      add(prevSameDay, "*", total);
      add(prevSameDay, s.entity_id, total);
    }
    if (day === today) revToday += total;
    if (s.status === "impayee" || s.status === "partielle") unpaid += total - Number(s.paid_mad);
  }
  const revOf = (m: string, eid?: string) => rev.get(eid ? `${m}|${eid}` : m) ?? 0;
  const trend = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);
  const revMonth = revOf(thisMonth);
  const revTrend = trend(revMonth, prevSameDay.get("*") ?? 0);

  /* ---------- Rendez-vous ---------- */
  const todayAppts = appts2d.filter((a) => dayKey(a.starts_at) === today);
  const toConfirm = appts2d.filter((a) => a.status === "prevu");
  const toConfirmToday = toConfirm.filter((a) => dayKey(a.starts_at) === today).length;
  const nowMs = Date.now();
  const nextAppt = todayAppts.find((a) => a.status !== "termine" && a.status !== "absent" && new Date(a.starts_at).getTime() + a.duration_min * 60000 > nowMs);
  const welcomed = todayAppts.filter((a) => a.status === "arrive" || a.status === "termine").length;
  const apptsByEntity = new Map<string, number>();
  for (const a of todayAppts) add(apptsByEntity, a.entity_id, 1);

  const contactIds = [...new Set(todayAppts.map((a) => a.contact_id))];
  const { data: contactRows } = contactIds.length ? await supabase.from("contacts").select("*").in("id", contactIds) : { data: [] };
  const contacts = byId(contactRows as Contact[]);

  /* ---------- Abonnements ---------- */
  const subsByEntity = new Map<string, number>();
  let expiring = 0;
  for (const s of subs) {
    add(subsByEntity, s.entity_id, 1);
    const end = s.end_date.slice(0, 10);
    if (end >= today && end <= in7) expiring++;
  }

  /* ---------- Prospects ---------- */
  const since30 = addDaysKey(today, -30);
  let open = 0;
  let toFollow = 0;
  let won30 = 0;
  let closed30 = 0;
  for (const l of leads) {
    if (l.stage !== "gagne" && l.stage !== "perdu") {
      open++;
      if (l.next_action_on && l.next_action_on <= today) toFollow++;
    } else if (l.updated_at >= since30) {
      closed30++;
      if (l.stage === "gagne") won30++;
    }
  }

  const hour = agadirHour();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const first = (me.full_name || "").split(" ")[0];
  const dateLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Casablanca" }).format(new Date());
  const entities = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const showEntities = !scope.current && entities.length > 1;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] capitalize text-muted">{dateLabel}</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {hello}
            {first ? `, ${first}` : ""}
          </h1>
          <p className="mt-1 text-[13px] text-muted">{scope.current ? scope.current.name : `Vue groupe · ${entities.length} établissements`}</p>
        </div>
        {/* Sur bureau, la barre du haut porte déjà ces actions */}
        <div className="flex gap-2 lg:hidden">
          <LinkButton href="/agenda/nouveau" variant="secondary">
            <CalendarDays /> Rendez-vous
          </LinkButton>
          <LinkButton href="/caisse">
            <ShoppingCart /> Encaisser
          </LinkButton>
        </div>
      </div>

      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile
          href="/rapports"
          label="CA du mois"
          value={madShort(revMonth)}
          sub={`Auj. ${madShort(revToday)}`}
          icon={<CircleDollarSign />}
          trendLabel={revTrend === null ? undefined : `${revTrend > 0 ? "+" : ""}${revTrend} %`}
          trendUp={revTrend === null || revTrend === 0 ? null : revTrend > 0}
          series={months.map((m) => revOf(m.key))}
        />
        <SolidTile href="/contacts?statut=client" label="Clients actifs" value={clientsCount ?? 0} sub={`+${newContacts ?? 0} contacts en 30 j`} icon={<Users />} />
        <SolidTile href="/agenda" label="Rendez-vous aujourd'hui" value={todayAppts.length} sub={`${welcomed} accueillis`} icon={<CalendarDays />} />
        <SolidTile href="/prospects" label="Prospects en cours" value={open} sub={closed30 ? `${pct(won30, closed30)} % convertis en 30 j` : "Aucun clôturé en 30 j"} icon={<Filter />} />
      </div>

      {/* À faire maintenant */}
      <section aria-labelledby="todo-title">
        <h2 id="todo-title" className="mb-2.5 text-sm font-semibold text-ink">
          À faire maintenant
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <ShortcutTile href="/taches" icon={<ListChecks />} label="Tâches dues" hint="En retard ou pour aujourd'hui" value={tasksDue ?? 0} hot={!!tasksDue} />
          <ShortcutTile
            href={toConfirm.length && !toConfirmToday ? `/agenda?date=${tomorrow}` : "/agenda"}
            icon={<CalendarCheck />}
            label="RDV à confirmer"
            hint="Aujourd'hui et demain"
            value={toConfirm.length}
            hot={toConfirm.length > 0}
          />
          <ShortcutTile href="/abonnements?filtre=expire-bientot" icon={<AlarmClock />} label="À renouveler" hint="Abonnements finissant sous 7 j" value={expiring} hot={expiring > 0} />
          <ShortcutTile href="/ventes?statut=impayee" icon={<Receipt />} label="Impayés" hint="Reste à encaisser" value={madShort(unpaid)} hot={unpaid > 0} />
        </div>
        {toFollow > 0 && (
          <p className="mt-2.5 text-[13px] text-muted">
            {toFollow} prospect{toFollow > 1 ? "s" : ""} à relancer aujourd&apos;hui ·{" "}
            <Link href="/prospects" className={linkCls}>
              Voir le pipeline
            </Link>
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr] [&>*]:min-w-0">
        {/* Rendez-vous du jour */}
        <Card>
          <CardHeader
            title="Rendez-vous du jour"
            subtitle={nextAppt ? `Prochain à ${fmtTime(nextAppt.starts_at)}` : todayAppts.length ? "Plus de rendez-vous à venir" : undefined}
            action={
              <Link href="/agenda" className={linkCls}>
                Agenda
              </Link>
            }
          />
          {todayAppts.length ? (
            <ul className="max-h-[380px] overflow-y-auto border-t border-line">
              {todayAppts.map((a) => {
                const c = contacts.get(a.contact_id);
                const isNext = nextAppt?.id === a.id;
                const done = a.status === "termine" || a.status === "absent";
                return (
                  <li key={a.id} className={cn("flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-b-0", isNext && "bg-brand-50/60")}>
                    <Link
                      href={`/agenda?sel=${a.id}`}
                      className="w-12 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                      aria-label={`Ouvrir le rendez-vous de ${fmtTime(a.starts_at)}`}
                    >
                      <span className={cn("block text-sm font-semibold tabular-nums", isNext ? "text-brand-600" : done ? "text-slate-400" : "text-ink")}>{fmtTime(a.starts_at)}</span>
                      <span className="block text-[11px] tabular-nums text-muted">{a.duration_min} min</span>
                    </Link>
                    <div className={cn("min-w-0 flex-1", done && "opacity-60")}>
                      <Link href={`/contacts/${a.contact_id}`} className="block truncate text-sm font-medium text-ink hover:text-brand-600 hover:underline">
                        {c?.full_name ?? "Client"}
                      </Link>
                      <p className="flex min-w-0 items-center gap-2 text-xs text-muted">
                        <span className="truncate">{a.service}</span>
                        {showEntities && <EntityBadge id={a.entity_id} className="hidden font-normal sm:inline-flex" />}
                      </p>
                    </div>
                    {isNext ? <Badge tone="brand">Prochain</Badge> : <Badge tone={STATUS_TONE[a.status]}>{APPT_STATUS_LABEL[a.status]}</Badge>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty
              icon={<CalendarDays />}
              title="Aucun rendez-vous aujourd'hui"
              action={
                <LinkButton href="/agenda/nouveau" variant="secondary">
                  Planifier un rendez-vous
                </LinkButton>
              }
            />
          )}
        </Card>

        {/* Chiffre d'affaires */}
        <Card>
          <CardHeader
            title="Chiffre d'affaires"
            subtitle={showEntities ? "7 derniers mois, par établissement" : "7 derniers mois"}
            action={
              <Link href="/rapports" className={linkCls}>
                Rapports
              </Link>
            }
          />
          <RevenueBars
            stacked={showEntities}
            months={months.map((m) => ({
              label: m.label,
              total: revOf(m.key),
              parts: entities.map((e) => ({ id: e.id, value: revOf(m.key, e.id) })),
            }))}
          />
        </Card>
      </div>

      {/* Établissements */}
      {showEntities && (
        <Card>
          <CardHeader
            title="Établissements"
            subtitle="Mois en cours, comparé à la même date le mois dernier"
            action={
              <Link href="/etablissements" className={linkCls}>
                Tout voir
              </Link>
            }
          />
          <div className="overflow-x-auto border-t border-line">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Établissement</th>
                  <th className="!text-right">CA du mois</th>
                  <th className="!text-right">Évolution</th>
                  <th className="hidden !text-right sm:table-cell">RDV auj.</th>
                  <th className="hidden !text-right sm:table-cell">Abonnés</th>
                </tr>
              </thead>
              <tbody>
                {entities.map((e) => {
                  const cur = revOf(thisMonth, e.id);
                  const t = trend(cur, prevSameDay.get(e.id) ?? 0);
                  return (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/etablissements/${e.id}`} className="inline-flex items-center gap-2 font-medium text-ink hover:text-brand-600 hover:underline">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden />
                          <span className="truncate">{e.short}</span>
                        </Link>
                      </td>
                      <td className="text-right font-semibold tabular-nums">{mad(cur)}</td>
                      <td className={cn("text-right text-[13px] font-medium tabular-nums", t === null || t === 0 ? "text-muted" : t > 0 ? "text-emerald-600" : "text-red-600")}>
                        {t === null ? "—" : `${t > 0 ? "+" : ""}${t} %`}
                      </td>
                      <td className="hidden text-right tabular-nums text-slate-600 sm:table-cell">{apptsByEntity.get(e.id) ?? 0}</td>
                      <td className="hidden text-right tabular-nums text-slate-600 sm:table-cell">{e.kind === "sport" ? (subsByEntity.get(e.id) ?? 0) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Barres fines du CA mensuel : bleu (un établissement) ou empilées en couleurs atténuées (groupe) */
function RevenueBars({ months, stacked }: { stacked: boolean; months: { label: string; total: number; parts: { id: string; value: number }[] }[] }) {
  const max = Math.max(1, ...months.map((m) => m.total));
  const ids = months[0]?.parts.map((p) => p.id) ?? [];
  const last = months.length - 1;
  return (
    <div className="px-5 pb-5">
      <div className="flex h-52 items-end gap-2 sm:gap-4" role="img" aria-label={`Chiffre d'affaires mensuel : ${months.map((m) => `${m.label} ${mad(m.total)}`).join(", ")}`}>
        {months.map((m, i) => (
          <div key={m.label + i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span className={cn("text-[11px] tabular-nums", i === last ? "font-semibold text-ink" : "text-muted")}>{madShort(m.total)}</span>
            <div
              className={cn("flex w-full max-w-[28px] flex-col-reverse overflow-hidden rounded-t-[4px]", !stacked && (i === last ? "bg-brand-500" : "bg-brand-200"))}
              style={{ height: `${(m.total / max) * 100}%`, minHeight: 2 }}
              title={`${m.label} : ${mad(m.total)}`}
            >
              {stacked &&
                m.parts.map((p) => (
                  <span
                    key={p.id}
                    title={`${entity(p.id)?.short} : ${mad(p.value)}`}
                    style={{ height: `${m.total ? (p.value / m.total) * 100 : 0}%`, background: entity(p.id)?.color, opacity: i === last ? 0.85 : 0.55 }}
                  />
                ))}
            </div>
            <span className={cn("text-xs capitalize", i === last ? "font-medium text-ink" : "text-muted")}>{m.label}</span>
          </div>
        ))}
      </div>
      {stacked && ids.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
          {ids.map((id) => (
            <EntityBadge key={id} id={id} className="font-normal" />
          ))}
        </div>
      )}
    </div>
  );
}
