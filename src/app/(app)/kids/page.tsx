import Link from "next/link";
import { Baby, Cake, CalendarCheck, ChevronLeft, ChevronRight, ClipboardCheck, Clock, HeartPulse, ListChecks, Plus, Users } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getTeam } from "@/lib/data";
import type { Contact } from "@/lib/types";
import { addDaysKey, age, cn, dayKey, fmtDate, pct, waLink } from "@/lib/utils";
import { attendanceRate, daysLabel, isoDay, type KidsAttendance, type KidsGroup } from "@/lib/types-care";
import { markAllPresent, markAttendance } from "@/actions/kids";
import { absenceMessage, loadKids, mainParent, phoneKey } from "@/components/kids/kids-data";
import { AttendanceButton } from "@/components/kids/attendance-button";
import { WhatsAppIcon } from "@/components/contacts/bits";
import { KpiStrip } from "@/components/kpi-strip";
import { SubmitButton } from "@/components/submit-button";
import { Badge, buttonClass, Card, CardHeader, Empty, LinkButton, PageHeader, Segmented } from "@/components/ui";
import { ListToolbar, type FilterGroup } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { ContactLink } from "@/components/quick-view/contact-link";
import { NoResults, ResultCount, clearHref, hasFilters, sortRows } from "@/components/reports/list-kit";

export const metadata = { title: "Moov'Up Kids" };

type View = "presences" | "groupes" | "familles" | "anniversaires";
const VIEWS: View[] = ["presences", "groupes", "familles", "anniversaires"];

export default async function KidsPage({ searchParams }: { searchParams: Promise<{ v?: string; date?: string; q?: string; groupe?: string; pointage?: string; places?: string; tri?: string }> }) {
  const [sp, me, scope] = await Promise.all([searchParams, getProfile(), getScope()]);
  const canManage = me.role === "direction" || me.role === "manager";

  if (!scope.ids.includes("kids")) {
    const hidden = scope.allowed.some((e) => e.id === "kids");
    return (
      <div>
        <PageHeader title="Moov'Up Kids" />
        <Card>
          <Empty
            icon={<Baby />}
            title={hidden ? "Moov'Up Kids est masqué par le filtre" : "Moov'Up Kids n'est pas dans votre périmètre"}
            text={hidden ? "Choisissez « Moov'Up Kids » ou « Tous » dans le sélecteur d'établissement en haut de l'écran." : "Demandez l'accès à la direction si vous travaillez avec les enfants."}
          />
        </Card>
      </div>
    );
  }

  const view: View = VIEWS.includes(sp.v as View) ? (sp.v as View) : "presences";
  const today = dayKey();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const supabase = await createClient();
  const [data, team] = await Promise.all([loadKids(supabase), getTeam(scope)]);
  const { groups, members, attendance, contactById, childByContact } = data;
  const people = byId(team);

  const enrolled = members.filter((m) => m.status === "inscrit");
  const waiting = members.filter((m) => m.status === "attente");
  const kidIds = new Set(enrolled.map((m) => m.contact_id));
  const rateByKid = new Map<string, number | null>();
  const attByKid = new Map<string, KidsAttendance[]>();
  for (const a of attendance) attByKid.set(a.contact_id, [...(attByKid.get(a.contact_id) ?? []), a]);
  for (const id of kidIds) rateByKid.set(id, attendanceRate(attByKid.get(id) ?? []));
  const globalRate = attendanceRate(attendance);
  const todayGroups = groups.filter((g) => g.days.includes(isoDay(today)));
  const expectedToday = enrolled.filter((m) => todayGroups.some((g) => g.id === m.group_id)).length;

  const month = today.slice(5, 7);
  const birthdays = data.contacts
    .filter((c) => c.birth_date && c.birth_date.slice(5, 7) === month && (kidIds.has(c.id) || c.status === "client"))
    .sort((a, b) => a.birth_date!.slice(8, 10).localeCompare(b.birth_date!.slice(8, 10)));

  const groupsOfKid = (id: string) => members.filter((m) => m.contact_id === id).map((m) => groups.find((g) => g.id === m.group_id)).filter((g): g is KidsGroup => !!g);

  /* ---------- Recherche et filtres (côté serveur) ---------- */
  const q = (sp.q ?? "").trim();
  const groupFilter = groups.some((g) => g.id === sp.groupe) ? sp.groupe! : null;
  const isFiltered = hasFilters(sp, ["q", "groupe", "pointage", "places"]);
  const clear = clearHref("/kids", sp, ["q", "groupe", "pointage", "places", "tri"]);
  /** Un enfant correspond à la recherche : nom, parents (noms, téléphones), groupes */
  const kidMatches = (c: Contact) => {
    const ch = childByContact.get(c.id);
    const p = mainParent(c, ch);
    return matchesQuery(q, c.full_name, c.phone, p.name, p.phone, ch?.parent2_name, ch?.parent2_phone, ...groupsOfKid(c.id).map((g) => g.name));
  };
  const inGroup = (c: Contact) => !groupFilter || members.some((m) => m.contact_id === c.id && m.group_id === groupFilter);
  const groupOptions = (list: KidsGroup[]): FilterGroup[] =>
    list.length > 1 ? [{ param: "groupe", label: "Tous les groupes", options: list.map((g) => ({ value: g.id, label: g.name })) }] : [];

  /* ---------- Présences du jour ---------- */
  const dayGroups = groups.filter((g) => g.days.includes(isoDay(date)));
  const pointage = sp.pointage === "absents" || sp.pointage === "afaire" ? sp.pointage : null;
  const dayMarks = new Map(attendance.filter((a) => a.date === date).map((a) => [`${a.group_id}:${a.contact_id}`, a.status]));
  const kidsOf = (g: KidsGroup) =>
    enrolled
      .filter((m) => m.group_id === g.id)
      .map((m) => contactById.get(m.contact_id))
      .filter((c): c is Contact => !!c)
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const presenceShown = dayGroups
    .filter((g) => !groupFilter || g.id === groupFilter)
    .map((g) => ({
      g,
      list: kidsOf(g).filter(
        (c) =>
          (kidMatches(c) || matchesQuery(q, g.name)) &&
          (!pointage || (pointage === "absents" ? dayMarks.get(`${g.id}:${c.id}`) === "absent" : !dayMarks.has(`${g.id}:${c.id}`))),
      ),
    }))
    .filter((x) => !isFiltered || x.list.length);
  const presenceTotal = dayGroups.reduce((a, g) => a + kidsOf(g).length, 0);
  const presenceCount = presenceShown.reduce((a, x) => a + x.list.length, 0);
  const presences = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1">
          <Link href={`/kids?date=${addDaysKey(date, -1)}`} scroll={false} className={buttonClass("ghost", "h-8 px-2")} aria-label="Jour précédent">
            <ChevronLeft />
          </Link>
          <span className="min-w-[150px] text-center text-sm font-medium capitalize text-ink">{date === today ? "Aujourd'hui" : fmtDate(date, { weekday: "long", day: "numeric", month: "long" })}</span>
          {date < today ? (
            <Link href={`/kids?date=${addDaysKey(date, 1)}`} scroll={false} className={buttonClass("ghost", "h-8 px-2")} aria-label="Jour suivant">
              <ChevronRight />
            </Link>
          ) : (
            <span className="w-8" />
          )}
        </div>
        {date !== today && (
          <Link href="/kids" className="text-[13px] font-medium text-brand-600 hover:underline">
            Revenir à aujourd&apos;hui
          </Link>
        )}
      </div>

      {dayGroups.length && !presenceShown.length ? (
        <Card>
          <NoResults q={q} href={clear} what="enfant" />
        </Card>
      ) : dayGroups.length ? (
        presenceShown.map(({ g, list }) => {
          const all = kidsOf(g);
          const marks = new Map(attendance.filter((a) => a.group_id === g.id && a.date === date).map((a) => [a.contact_id, a.status]));
          const present = [...marks.values()].filter((s) => s === "present").length;
          const coach = g.coach_id ? people.get(g.coach_id) : undefined;
          return (
            <Card key={g.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
                <div className="min-w-0">
                  <Link href={`/kids/groupes/${g.id}`} className="text-sm font-semibold text-ink hover:text-brand-600">
                    {g.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {g.start_time}–{g.end_time}
                    {g.location && ` · ${g.location}`}
                    {coach && ` · ${coach.full_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] tabular-nums text-muted">
                    <span className="font-semibold text-ink">{present}</span> présent{present > 1 ? "s" : ""} · {marks.size}/{all.length} pointés
                  </span>
                  {all.length > marks.size && (
                    <form action={markAllPresent.bind(null, g.id, date)}>
                      <SubmitButton variant="secondary" className="h-8" pendingText="…">
                        <ClipboardCheck /> Tous présents
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
              {list.length ? (
                <ul className="divide-y divide-line border-t border-line" data-kids-roll>
                  {list.map((c) => {
                    const st = marks.get(c.id);
                    const rate = rateByKid.get(c.id) ?? null;
                    const child = childByContact.get(c.id);
                    const parent = mainParent(c, child);
                    const wa = st === "absent" ? waLink(parent.phone, absenceMessage(c, g, date, today)) : null;
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm">
                            <ContactLink id={c.id} name={c.full_name} className="truncate" />
                            {child?.health_notes && (
                              <span title={child.health_notes}>
                                <HeartPulse className="size-3.5 text-amber-500" />
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {age(c.birth_date) !== null && `${age(c.birth_date)} ans · `}
                            <span className={cn(rate !== null && rate < 70 && "font-medium text-red-600")}>{rate === null ? "Nouveau" : `${rate} % de présence`}</span>
                            {child && !child.allow_photos && " · pas de photos"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {wa && (
                            <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "h-8 px-2.5")} title={`Prévenir ${parent.name} sur WhatsApp`}>
                              <WhatsAppIcon className="size-4 text-emerald-600" />
                              <span className="hidden sm:inline">Parent</span>
                            </a>
                          )}
                          {(["present", "absent", "excuse"] as const).map((s) => (
                            <AttendanceButton key={s} status={s} active={st === s} action={markAttendance.bind(null, g.id, c.id, date, s)} />
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="border-t border-line px-5 py-4 text-[13px] text-muted">
                  Aucun enfant inscrit.{" "}
                  <Link href={`/kids/groupes/${g.id}`} className="font-medium text-brand-600 hover:underline">
                    Inscrire un enfant
                  </Link>
                </p>
              )}
            </Card>
          );
        })
      ) : (
        <Card>
          <Empty icon={<CalendarCheck />} title="Aucun cours ce jour-là" text="Les feuilles de présence apparaissent les jours où un groupe a cours." />
        </Card>
      )}
    </div>
  );

  /* ---------- Groupes ---------- */
  const places = sp.places === "dispo" || sp.places === "complet" || sp.places === "attente" ? sp.places : null;
  const fill = (g: KidsGroup) => enrolled.filter((m) => m.group_id === g.id).length;
  const groupTri = sp.tri === "remplissage" || sp.tri === "presence" ? sp.tri : "horaire";
  const groupShown = sortRows(
    groups.filter(
      (g) =>
        matchesQuery(q, g.name, g.activity, g.location, g.coach_id ? people.get(g.coach_id)?.full_name : null, daysLabel(g.days)) &&
        (!places || (places === "complet" ? fill(g) >= g.capacity : places === "dispo" ? fill(g) < g.capacity : waiting.some((m) => m.group_id === g.id))),
    ),
    (g) => (groupTri === "remplissage" ? fill(g) / Math.max(1, g.capacity) : groupTri === "presence" ? attendanceRate(attendance.filter((a) => a.group_id === g.id)) : g.start_time),
    groupTri === "horaire" ? "asc" : "desc",
  );
  const groupsView = groups.length && !groupShown.length ? (
    <Card>
      <NoResults q={q} href={clear} what="groupe" />
    </Card>
  ) : groups.length ? (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
      {groupShown.map((g) => {
        const n = enrolled.filter((m) => m.group_id === g.id).length;
        const w = waiting.filter((m) => m.group_id === g.id).length;
        const rate = attendanceRate(attendance.filter((a) => a.group_id === g.id));
        const coach = g.coach_id ? people.get(g.coach_id) : undefined;
        return (
          <Link key={g.id} href={`/kids/groupes/${g.id}`} className="group rounded-xl border border-line bg-white p-4 transition hover:border-slate-300">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{g.name}</p>
                <p className="truncate text-xs text-muted">
                  {g.activity} · {g.age_min}-{g.age_max} ans
                </p>
              </div>
              {w > 0 && <Badge tone="amber">{w} en attente</Badge>}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-slate-600">
              <Clock className="size-3.5 text-slate-400" /> {daysLabel(g.days)} · {g.start_time}–{g.end_time}
            </p>
            <p className="mt-1 truncate text-[13px] text-slate-600">{[coach?.full_name ?? "Coach à définir", g.location].filter(Boolean).join(" · ")}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className={cn("h-full rounded-full", n >= g.capacity ? "bg-accent-500" : "bg-brand-500")} style={{ width: `${Math.min(100, pct(n, g.capacity))}%` }} />
              </div>
              <span className="text-xs tabular-nums text-muted">
                {n}/{g.capacity}
              </span>
              <span className="text-xs tabular-nums text-muted">{rate === null ? "" : `· ${rate} % présence`}</span>
            </div>
          </Link>
        );
      })}
    </div>
  ) : (
    <Card>
      <Empty
        icon={<Users />}
        title="Aucun groupe"
        text="Créez les groupes d'activité (natation, foot, gym…) pour inscrire les enfants et faire l'appel."
        action={
          canManage ? (
            <LinkButton href="/kids/groupes/nouveau" variant="brand">
              <Plus /> Nouveau groupe
            </LinkButton>
          ) : undefined
        }
      />
    </Card>
  );

  /* ---------- Familles ---------- */
  const families = new Map<string, { key: string; name: string; phone: string | null; relation: string | null; second: string | null; kids: Contact[] }>();
  for (const c of data.contacts) {
    if (!kidIds.has(c.id) && !waiting.some((m) => m.contact_id === c.id) && c.status !== "client") continue;
    const ch = childByContact.get(c.id);
    const p = mainParent(c, ch);
    const key = phoneKey(p.phone) || c.id;
    const f = families.get(key) ?? { key: c.id, name: p.name, phone: p.phone, relation: ch?.parent1_relation ?? null, second: ch?.parent2_name ?? null, kids: [] };
    f.kids.push(c);
    families.set(key, f);
  }
  const familyList = sortRows(
    [...families.values()].filter(
      (f) => (matchesQuery(q, f.name, f.phone, f.second) || f.kids.some((k) => kidMatches(k))) && (!groupFilter || f.kids.some((k) => inGroup(k))),
    ),
    (f) => (sp.tri === "enfants" ? f.kids.length : f.name),
    sp.tri === "enfants" ? "desc" : "asc",
  );
  const familiesView = (
    <Card>
      <div className="px-5 pb-3 pt-4">
        <h3 className="text-sm font-semibold text-ink">
          Familles <span className="font-normal text-muted">· {familyList.length}</span>
        </h3>
      </div>
      {familyList.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {familyList.map((f) => {
            const wa = waLink(f.phone, `Bonjour ${f.name.split(" ")[0]}, ici l'équipe Moov'Up Kids.`);
            return (
              <li key={f.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/kids/parent/${f.key}`} className="block truncate text-sm font-medium text-ink hover:text-brand-600">
                    {f.name}
                    {f.relation && <span className="font-normal text-muted"> · {f.relation}</span>}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {f.kids.map((k, i) => (
                      <span key={k.id}>
                        {i > 0 && ", "}
                        <ContactLink id={k.id} name={k.full_name.split(" ")[0]} className="font-normal text-slate-600" />
                        {age(k.birth_date) !== null ? ` (${age(k.birth_date)} ans)` : ""}
                      </span>
                    ))}
                    {f.second && ` · 2e contact : ${f.second}`}
                  </p>
                </div>
                <span className="text-xs tabular-nums text-muted">{f.phone}</span>
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "h-8 px-2")} title="WhatsApp">
                    <WhatsAppIcon className="size-4 text-emerald-600" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      ) : isFiltered ? (
        <NoResults q={q} href={clear} what="famille" />
      ) : (
        <Empty icon={<Users />} title="Aucune famille" text="Les familles apparaissent dès qu'un enfant est inscrit." />
      )}
    </Card>
  );

  /* ---------- Anniversaires ---------- */
  const birthdayShown = birthdays.filter((c) => kidMatches(c) && inGroup(c));
  const birthdaysView = (
    <Card>
      <CardHeader title={`Anniversaires de ${fmtDate(today, { month: "long" })}`} subtitle="Un message au parent, et pourquoi pas la formule anniversaire" icon={<Cake />} />
      {birthdayShown.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {birthdayShown.map((c) => {
            const d = c.birth_date!.slice(8, 10);
            const dKey = `${today.slice(0, 8)}${d}`;
            const passed = dKey < today;
            const turning = (age(c.birth_date) ?? 0) + (passed || dKey === today ? 0 : 1);
            const parent = mainParent(c, childByContact.get(c.id));
            const wa = waLink(parent.phone, `Bonjour ${parent.name.split(" ")[0]}, toute l'équipe Moov'Up Kids souhaite un très joyeux anniversaire à ${c.full_name.split(" ")[0]} pour ses ${turning} ans !`);
            const g = groupsOfKid(c.id)[0];
            return (
              <li key={c.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", passed && "opacity-60")}>
                <span className="w-10 shrink-0 text-center">
                  <span className="block text-base font-semibold tabular-nums text-ink">{Number(d)}</span>
                  <span className="block text-[11px] uppercase text-muted">{fmtDate(today, { month: "short" }).replace(".", "")}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <ContactLink id={c.id} name={c.full_name} />
                  </p>
                  <p className="truncate text-xs text-muted">
                    {turning} ans{g ? ` · ${g.name}` : ""} · {parent.name}
                  </p>
                </div>
                {dKey === today && <Badge tone="accent">Aujourd&apos;hui</Badge>}
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "h-8")}>
                    <WhatsAppIcon className="size-4 text-emerald-600" /> Souhaiter
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      ) : isFiltered && birthdays.length ? (
        <NoResults q={q} href={clear} what="enfant" />
      ) : (
        <Empty icon={<Cake />} title="Aucun anniversaire ce mois-ci" />
      )}
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="Moov'Up Kids"
        subtitle="Groupes, appel du jour, familles et anniversaires"
        actions={
          canManage ? (
            <LinkButton href="/kids/groupes/nouveau" variant="brand">
              <Plus /> Nouveau groupe
            </LinkButton>
          ) : undefined
        }
      />

      <KpiStrip
        id="kids"
        className="mb-6"
        items={[
          { label: "Enfants inscrits", value: kidIds.size, sub: `${groups.length} groupe${groups.length > 1 ? "s" : ""}`, icon: <Baby />, href: "/kids?v=familles" },
          { label: "Présence (4 semaines)", value: globalRate === null ? "–" : `${globalRate} %`, sub: `${attendance.filter((a) => a.status === "absent").length} absences`, icon: <ListChecks /> },
          { label: "Cours aujourd'hui", value: todayGroups.length, sub: `${expectedToday} enfant${expectedToday > 1 ? "s" : ""} attendu${expectedToday > 1 ? "s" : ""}`, icon: <CalendarCheck />, href: "/kids" },
          {
            label: "Liste d'attente",
            value: waiting.length,
            sub: birthdays.length ? `${birthdays.length} anniversaire${birthdays.length > 1 ? "s" : ""} ce mois` : "Aucun anniversaire ce mois",
            icon: <Users />,
            href: "/kids?v=groupes",
          },
        ]}
      />

      <div className="mb-4">
        <Segmented
          active={view}
          items={[
            { id: "presences", href: "/kids", label: "Appel du jour", count: todayGroups.length },
            { id: "groupes", href: "/kids?v=groupes", label: "Groupes", count: groups.length },
            { id: "familles", href: "/kids?v=familles", label: "Familles", count: families.size },
            { id: "anniversaires", href: "/kids?v=anniversaires", label: "Anniversaires", count: birthdays.length },
          ]}
        />
      </div>

      <ListToolbar
        key={view}
        placeholder={view === "groupes" ? "Groupe, activité, coach…" : "Enfant, parent, téléphone, groupe…"}
        filters={
          view === "presences"
            ? [...groupOptions(dayGroups), { param: "pointage", label: "Tous", options: [{ value: "afaire", label: "À pointer" }, { value: "absents", label: "Absents" }] }]
            : view === "groupes"
              ? [
                  { param: "places", label: "Tous", options: [{ value: "dispo", label: "Places libres" }, { value: "complet", label: "Complets" }, { value: "attente", label: "Liste d'attente" }] },
                  { param: "tri", label: "Par horaire", options: [{ value: "remplissage", label: "Remplissage" }, { value: "presence", label: "Présence" }] },
                ]
              : view === "familles"
                ? [...groupOptions(groups), { param: "tri", label: "Par nom", options: [{ value: "enfants", label: "Nb d'enfants" }] }]
                : groupOptions(groups)
        }
        right={
          view === "presences" ? (
            <ResultCount shown={presenceCount} total={presenceTotal} filtered={isFiltered} unit="enfant" />
          ) : view === "groupes" ? (
            <ResultCount shown={groupShown.length} total={groups.length} filtered={isFiltered} unit="groupe" />
          ) : view === "familles" ? (
            <ResultCount shown={familyList.length} total={families.size} filtered={isFiltered} unit="famille" />
          ) : (
            <ResultCount shown={birthdayShown.length} total={birthdays.length} filtered={isFiltered} unit="anniversaire" />
          )
        }
      />

      {view === "presences" && presences}
      {view === "groupes" && groupsView}
      {view === "familles" && familiesView}
      {view === "anniversaires" && birthdaysView}
    </div>
  );
}
