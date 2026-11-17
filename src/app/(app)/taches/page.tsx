import { CalendarDays, ChevronRight, ListChecks, Plus } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getContacts, getTeam } from "@/lib/data";
import { entity } from "@/lib/entities";
import { addDaysKey, cn, dayKey, daysUntil, fmtDate } from "@/lib/utils";
import type { Contact, Profile, Task, TaskPriority } from "@/lib/types";
import { deleteTask, toggleTask } from "@/actions/tasks";
import { Avatar, Badge, Card, CardHeader, Empty, LinkButton, PageHeader } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery, one } from "@/components/data-table/match";
import { NoResults, ResultCount } from "@/components/data-table/no-results";
import { SaveViewButton } from "@/components/data-table/save-view";
import { ContactLink } from "@/components/quick-view/contact-link";
import { TaskCheck, TaskDelete } from "@/components/tasks/task-controls";
import { TaskQuickForm } from "@/components/tasks/task-form";

export const metadata = { title: "Tâches" };

const PRIO_ORDER = { haute: 0, normale: 1, basse: 2 } as const;
const PRIOS: TaskPriority[] = ["haute", "normale", "basse"];
const ECHEANCES = ["retard", "aujourdhui", "semaine", "sans-date"] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, me, scope] = await Promise.all([searchParams, getProfile(), getScope()]);
  const mine = one(sp.vue) === "moi";
  const q = one(sp.q)?.slice(0, 80);
  const prioRaw = one(sp.priorite) as TaskPriority | undefined;
  const prio = prioRaw && PRIOS.includes(prioRaw) ? prioRaw : undefined;
  const echRaw = one(sp.echeance) as (typeof ECHEANCES)[number] | undefined;
  const ech = echRaw && ECHEANCES.includes(echRaw) ? echRaw : undefined;
  const etab = scope.ids.find((e) => e === one(sp.etab));
  const supabase = await createClient();
  const today = dayKey();
  const in7 = addDaysKey(today, 7);

  const [{ data: inScope }, { data: noEntity }, { data: profileRows }, team, contactsList] = await Promise.all([
    supabase.from("tasks").select("*").in("entity_id", scope.ids).order("due_date"),
    supabase.from("tasks").select("*").is("entity_id", null),
    supabase.from("profiles").select("*"),
    getTeam(scope),
    getContacts(scope),
  ]);
  const all = [...((inScope ?? []) as Task[]), ...((noEntity ?? []) as Task[])];
  const people = byId(profileRows as Profile[]);
  const contacts = byId(contactsList as Contact[]);

  const tasks = all.filter((t) => {
    if (mine && t.assigned_to !== me.id) return false;
    if (prio && t.priority !== prio) return false;
    if (etab && t.entity_id !== etab) return false;
    if (ech) {
      const d = t.due_date;
      if (ech === "sans-date" ? d : !d) return false;
      if (ech === "retard" && (t.done || d! >= today)) return false;
      if (ech === "aujourdhui" && d !== today) return false;
      if (ech === "semaine" && (d! < today || d! > in7)) return false;
    }
    const c = t.contact_id ? contacts.get(t.contact_id) : undefined;
    const who = t.assigned_to ? people.get(t.assigned_to) : undefined;
    return matchesQuery(q, t.title, c?.full_name, c?.phone, who?.full_name, t.entity_id ? entity(t.entity_id)?.short : null, t.priority === "haute" ? "priorité haute urgent" : null);
  });
  const filtered = !!(q || prio || ech || etab);

  const sort = (a: Task, b: Task) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
  const open = tasks.filter((t) => !t.done).sort(sort);
  const late = open.filter((t) => t.due_date && t.due_date < today);
  const todayList = open.filter((t) => t.due_date === today);
  const upcoming = open.filter((t) => t.due_date && t.due_date > today);
  const noDate = open.filter((t) => !t.due_date);
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));

  // Résumé (toujours sur l'ensemble des tâches ouvertes de la vue Toutes / Mes tâches)
  const base = (mine ? all.filter((t) => t.assigned_to === me.id) : all).filter((t) => !t.done);
  const nLate = base.filter((t) => t.due_date && t.due_date < today).length;
  const nToday = base.filter((t) => t.due_date === today).length;
  const nWeek = base.filter((t) => t.due_date && t.due_date > today && t.due_date <= in7).length;
  const mineCount = all.filter((t) => !t.done && t.assigned_to === me.id).length;

  const defaultEntity = scope.current?.id ?? scope.allowed[0]?.id ?? "sports";

  const row = (t: Task) => {
    const who = t.assigned_to ? people.get(t.assigned_to) : undefined;
    const c = t.contact_id ? contacts.get(t.contact_id) : undefined;
    const d = t.due_date ? daysUntil(t.due_date) : null;
    return (
      <li key={t.id} className={cn("flex items-start gap-3 px-4 py-3 sm:px-5", t.done && "opacity-60")}>
        <TaskCheck action={toggleTask.bind(null, t.id)} done={t.done} />
        <div className="min-w-0 flex-1 pt-1">
          <p className={cn("text-sm text-ink", t.done && "text-muted line-through decoration-slate-300")}>{t.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {d !== null && (
              <span className={cn("inline-flex items-center gap-1 tabular-nums", !t.done && d < 0 ? "font-medium text-red-600" : !t.done && d === 0 ? "font-medium text-amber-700" : "")}>
                <CalendarDays className="size-3.5" />
                {t.done ? fmtDate(t.due_date!, { day: "numeric", month: "short" }) : d < 0 ? `En retard de ${-d} j` : d === 0 ? "Aujourd'hui" : d === 1 ? "Demain" : fmtDate(t.due_date!, { weekday: "short", day: "numeric", month: "short" })}
              </span>
            )}
            {t.priority === "haute" && !t.done && <Badge tone="red">Priorité haute</Badge>}
            {t.priority === "basse" && !t.done && <span>Priorité basse</span>}
            {t.entity_id && <EntityBadge id={t.entity_id} />}
            {c && <ContactLink id={c.id} name={c.full_name} className="max-w-full truncate text-xs" />}
          </div>
        </div>
        {who && (
          <span className="flex shrink-0 items-center gap-2 pt-1" title={`Assignée à ${who.full_name}`}>
            <Avatar name={who.full_name} size={24} />
            <span className="hidden max-w-[110px] truncate text-xs text-slate-600 sm:inline">{who.id === me.id ? "Moi" : who.full_name.split(" ")[0]}</span>
          </span>
        )}
        <TaskDelete action={deleteTask.bind(null, t.id)} />
      </li>
    );
  };

  const group = (title: string, list: Task[], opts: { alert?: boolean; hint?: string } = {}) =>
    list.length ? (
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 className={cn("text-sm font-semibold", opts.alert ? "text-red-600" : "text-ink")}>{title}</h2>
          <span className="text-xs tabular-nums text-muted">{list.length}</span>
          {opts.hint && <span className="ml-auto hidden text-xs text-muted sm:inline">{opts.hint}</span>}
        </div>
        <ul className="divide-y divide-line">{list.map(row)}</ul>
      </Card>
    ) : null;

  const summary = [nLate && `${nLate} en retard`, `${nToday} aujourd'hui`, `${nWeek} dans les 7 jours`].filter(Boolean).join(" · ");
  const clearHref = mine ? "/taches?vue=moi" : "/taches";
  const viewName = ["Tâches", mine && "à moi", ech === "retard" && "en retard", prio === "haute" && "priorité haute", etab && entity(etab)?.short, q && `« ${q} »`].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tâches"
        subtitle={summary}
        actions={
          <LinkButton href="#nouvelle-tache" variant="brand">
            <Plus /> Nouvelle tâche
          </LinkButton>
        }
      />

      <ListToolbar
        placeholder="Tâche, client, téléphone, collègue…"
        filters={[
          { param: "vue", label: "Toutes", options: [{ value: "moi", label: "Mes tâches", count: mineCount }] },
          {
            param: "echeance",
            label: "Toute échéance",
            options: [
              { value: "retard", label: "En retard" },
              { value: "aujourdhui", label: "Aujourd'hui" },
              { value: "semaine", label: "7 jours" },
              { value: "sans-date", label: "Sans date" },
            ],
          },
          { param: "priorite", label: "Toute priorité", options: [{ value: "haute", label: "Haute" }, { value: "normale", label: "Normale" }, { value: "basse", label: "Basse" }] },
          ...(scope.ids.length > 1 ? [{ param: "etab", label: "Tous établ.", options: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ value: e.id, label: e.short })) }] : []),
        ]}
        right={<SaveViewButton defaultLabel={viewName} icon="/taches" />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        <div className="space-y-4">
          {filtered && <ResultCount n={tasks.length} unit={["tâche", "tâches"]} />}
          {filtered && tasks.length === 0 ? (
            <Card>
              <NoResults query={q} clearHref={clearHref} />
            </Card>
          ) : (
            open.length === 0 &&
            !filtered && (
              <Card>
                <Empty
                  icon={<ListChecks />}
                  title={mine ? "Aucune tâche pour vous" : "Aucune tâche en cours"}
                  text={mine ? "Les tâches qui vous sont assignées apparaîtront ici." : "Ajoutez un rappel : relance, appel, commande…"}
                  action={
                    <LinkButton href="#nouvelle-tache" variant="brand">
                      <Plus /> Nouvelle tâche
                    </LinkButton>
                  }
                />
              </Card>
            )
          )}
          {group("En retard", late, { alert: true, hint: "Échéance dépassée" })}
          {group("Aujourd'hui", todayList)}
          {group("À venir", upcoming)}
          {group("Sans date", noDate)}

          {done.length > 0 && (
            <details className="group/done overflow-hidden rounded-xl border border-line bg-white" open={filtered && open.length === 0}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40 sm:px-5 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 text-slate-400 transition group-open/done:rotate-90" />
                <h2 className="text-sm font-semibold text-ink">Terminées</h2>
                <span className="text-xs tabular-nums text-muted">{done.length}</span>
              </summary>
              <ul className="divide-y divide-line border-t border-line">{done.map(row)}</ul>
            </details>
          )}
        </div>

        <aside id="nouvelle-tache" className="scroll-mt-6">
          <Card className="lg:sticky lg:top-6">
            <CardHeader title="Nouvelle tâche" subtitle="Un rappel pour vous ou un collègue" />
            <div className="px-5 pb-5">
              <TaskQuickForm
                entities={scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color }))}
                defaultEntity={defaultEntity}
                team={team.map((m) => ({ id: m.id, full_name: m.full_name, entity_ids: m.entity_ids, job_title: m.job_title }))}
                contacts={contactsList.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone }))}
                meId={me.id}
                today={today}
              />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
