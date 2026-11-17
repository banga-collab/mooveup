import Link from "next/link";
import type { ReactNode } from "react";
import { AlarmClock, CalendarClock, CalendarDays, CheckCheck, ChevronDown, CircleDashed, Flag, ListChecks, Plus, Sun, UserRound } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getContacts, getTeam } from "@/lib/data";
import { addDaysKey, cn, dayKey, daysUntil, fmtDate } from "@/lib/utils";
import type { Contact, Profile, Task } from "@/lib/types";
import { deleteTask, toggleTask } from "@/actions/tasks";
import { SolidTile } from "@/components/stat-tile";
import { Avatar, Card, Empty, PageHeader } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { TaskCheck, TaskDelete } from "@/components/tasks/task-controls";
import { TaskQuickForm } from "@/components/tasks/task-form";
import { PRIORITY_META } from "@/components/tasks/priority";

export const metadata = { title: "Tâches" };

const PRIO_ORDER = { haute: 0, normale: 1, basse: 2 } as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const [{ vue }, me, scope] = await Promise.all([searchParams, getProfile(), getScope()]);
  const mine = vue === "moi";
  const supabase = await createClient();
  const today = dayKey();

  const [{ data: inScope }, { data: noEntity }, { data: profileRows }, team, contactsList] = await Promise.all([
    supabase.from("tasks").select("*").in("entity_id", scope.ids).order("due_date"),
    supabase.from("tasks").select("*").is("entity_id", null),
    supabase.from("profiles").select("*"),
    getTeam(scope),
    getContacts(scope),
  ]);
  const all = [...((inScope ?? []) as Task[]), ...((noEntity ?? []) as Task[])];
  const tasks = mine ? all.filter((t) => t.assigned_to === me.id) : all;
  const people = byId(profileRows as Profile[]);
  const contacts = byId(contactsList as Contact[]);

  const sort = (a: Task, b: Task) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
  const open = tasks.filter((t) => !t.done).sort(sort);
  const late = open.filter((t) => t.due_date && t.due_date < today);
  const todayList = open.filter((t) => t.due_date === today);
  const upcoming = open.filter((t) => t.due_date && t.due_date > today);
  const noDate = open.filter((t) => !t.due_date);
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));
  const week = upcoming.filter((t) => t.due_date! <= addDaysKey(today, 7)).length;
  const mineCount = all.filter((t) => !t.done && t.assigned_to === me.id).length;

  const defaultEntity = scope.current?.id ?? scope.allowed[0]?.id ?? "sports";

  const row = (t: Task) => {
    const who = t.assigned_to ? people.get(t.assigned_to) : undefined;
    const c = t.contact_id ? contacts.get(t.contact_id) : undefined;
    const p = PRIORITY_META[t.priority];
    const d = t.due_date ? daysUntil(t.due_date) : null;
    return (
      <li key={t.id} className={cn("group relative flex items-start gap-3 px-4 py-3.5 transition hover:bg-canvas/60 sm:px-5", t.done && "opacity-60")}>
        <span className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: t.done ? "#cbd5e1" : p.color }} />
        <TaskCheck action={toggleTask.bind(null, t.id)} done={t.done} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold text-ink", t.done && "line-through decoration-slate-400")}>{t.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
            {t.entity_id && <EntityBadge id={t.entity_id} />}
            {t.priority !== "normale" && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold" style={{ background: p.soft, color: p.color }}>
                <Flag className="size-3" /> {p.label}
              </span>
            )}
            {d !== null && (
              <span className={cn("inline-flex items-center gap-1 font-semibold", !t.done && d < 0 ? "text-red-600" : !t.done && d === 0 ? "text-accent-600" : "text-slate-500")}>
                <CalendarDays className="size-3.5" />
                {t.done ? fmtDate(t.due_date!, { day: "numeric", month: "short" }) : d < 0 ? `En retard de ${-d} j` : d === 0 ? "Aujourd'hui" : d === 1 ? "Demain" : fmtDate(t.due_date!, { weekday: "short", day: "numeric", month: "short" })}
              </span>
            )}
            {c && (
              <Link href={`/contacts/${c.id}`} className="inline-flex max-w-full items-center gap-1 font-semibold text-brand-600 hover:underline">
                <UserRound className="size-3.5 shrink-0" />
                <span className="truncate">{c.full_name}</span>
              </Link>
            )}
          </div>
        </div>
        {who && (
          <span className="hidden shrink-0 items-center gap-2 sm:flex" title={who.full_name}>
            <Avatar name={who.full_name} size={26} />
            <span className="max-w-[110px] truncate text-xs font-medium text-slate-600">{who.id === me.id ? "Moi" : who.full_name.split(" ")[0]}</span>
          </span>
        )}
        {who && (
          <span className="sm:hidden" title={who.full_name}>
            <Avatar name={who.full_name} size={24} />
          </span>
        )}
        <TaskDelete action={deleteTask.bind(null, t.id)} />
      </li>
    );
  };

  const group = (title: string, icon: ReactNode, list: Task[], tone: string, hint?: string) =>
    list.length ? (
      <Card className="overflow-hidden animate-fade-up">
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
          <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: tone }}>
            {icon}
          </span>
          <h2 className="font-display text-[15px] font-bold">{title}</h2>
          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `${tone}18`, color: tone }}>
            {list.length}
          </span>
          {hint && <span className="ml-auto hidden text-xs text-muted sm:inline">{hint}</span>}
        </div>
        <ul className="divide-y divide-line">{list.map(row)}</ul>
      </Card>
    ) : null;

  const tab = (href: string, label: string, on: boolean, count: number) => (
    <Link
      href={href}
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition", on ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}
    >
      {label}
      <span className={cn("rounded-full px-1.5 text-[11px] font-bold", on ? "bg-brand-50 text-brand-600" : "bg-white/70 text-slate-500")}>{count}</span>
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tâches"
        subtitle={scope.current ? `${scope.current.name} · rappels et suivis de l'équipe` : "Rappels et suivis de l'équipe, tous établissements"}
        actions={
          <div className="flex rounded-xl border border-line bg-canvas p-1">
            {tab("/taches", "Toutes", !mine, all.filter((t) => !t.done).length)}
            {tab("/taches?vue=moi", "Mes tâches", mine, mineCount)}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile tone="accent" label="En retard" value={late.length} sub={late.length ? "À traiter en priorité" : "Rien en retard, bravo"} icon={<AlarmClock />} watermark={<AlarmClock />} />
        <SolidTile tone="brand" label="Aujourd'hui" value={todayList.length} sub={`${todayList.filter((t) => t.priority === "haute").length} en priorité haute`} icon={<Sun />} watermark={<Sun />} />
        <SolidTile tone="violet" label="À venir" value={upcoming.length} sub={`${week} dans les 7 prochains jours`} icon={<CalendarClock />} watermark={<CalendarClock />} />
        <SolidTile tone="green" label="Terminées" value={done.length} sub={tasks.length ? `${Math.round((done.length / tasks.length) * 100)} % des tâches` : "Aucune tâche"} icon={<CheckCheck />} watermark={<CheckCheck />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
        <aside className="lg:order-last">
          <Card className="p-5 lg:sticky lg:top-6">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-accent-500 text-white shadow-lg shadow-accent-500/25">
                <Plus className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-[15px] font-bold">Nouvelle tâche</h2>
                <p className="text-xs text-muted">Un rappel pour vous ou un collègue</p>
              </div>
            </div>
            <TaskQuickForm
              entities={scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color }))}
              defaultEntity={defaultEntity}
              team={team.map((m) => ({ id: m.id, full_name: m.full_name, entity_ids: m.entity_ids, job_title: m.job_title }))}
              contacts={contactsList.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone }))}
              meId={me.id}
              today={today}
            />
          </Card>
        </aside>

        <div className="space-y-5">
          {open.length === 0 && (
            <Card>
              <Empty
                icon={<ListChecks className="size-6" />}
                title={mine ? "Aucune tâche pour vous" : "Aucune tâche en cours"}
                text={mine ? "Les tâches qui vous sont assignées apparaîtront ici." : "Ajoutez un rappel avec le formulaire : relance, appel, commande…"}
              />
            </Card>
          )}
          {group("En retard", <AlarmClock className="size-4" />, late, "#dc2626", "Échéance dépassée")}
          {group("Aujourd'hui", <Sun className="size-4" />, todayList, "#e8782a")}
          {group("À venir", <CalendarClock className="size-4" />, upcoming, "#1a6d8e")}
          {group("Sans date", <CircleDashed className="size-4" />, noDate, "#64748b")}

          {done.length > 0 && (
            <details className="group/done overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
                <span className="grid size-8 place-items-center rounded-lg bg-emerald-500 text-white">
                  <CheckCheck className="size-4" />
                </span>
                <h2 className="font-display text-[15px] font-bold">Terminées</h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">{done.length}</span>
                <ChevronDown className="ml-auto size-4 text-muted transition group-open/done:rotate-180" />
              </summary>
              <ul className="divide-y divide-line border-t border-line">{done.map(row)}</ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
