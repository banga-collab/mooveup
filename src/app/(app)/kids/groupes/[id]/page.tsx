import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, Pencil, Trash2, UserPlus, Users, X } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getTeam } from "@/lib/data";
import type { Contact } from "@/lib/types";
import { addDaysKey, age, cn, dayKey, fmtDate, waLink } from "@/lib/utils";
import { attendanceRate, daysLabel, isoDay, type KidsMember } from "@/lib/types-care";
import { deleteGroup, enrollChild, promoteMember, removeMember, saveGroup } from "@/actions/kids";
import { loadKids, mainParent } from "@/components/kids/kids-data";
import { GroupForm } from "@/components/kids/group-form";
import { WhatsAppIcon } from "@/components/contacts/bits";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { ContactPicker } from "@/components/contact-picker";
import { BackLink } from "@/components/back-link";
import { Badge, buttonClass, Card, CardHeader, Empty, LinkButton, PageHeader } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { ContactLink } from "@/components/quick-view/contact-link";
import { NoResults, ResultCount, clearHref, hasFilters, sortRows } from "@/components/reports/list-kit";

export const metadata = { title: "Groupe Kids" };

const DOT = { present: "bg-emerald-500", absent: "bg-red-500", excuse: "bg-amber-400" } as const;

export default async function KidsGroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; suivi?: string; tri?: string }> }) {
  const [{ id }, sp, me, scope] = await Promise.all([params, searchParams, getProfile(), getScope()]);
  if (!scope.allowed.some((e) => e.id === "kids")) notFound();
  const supabase = await createClient();
  const [data, team] = await Promise.all([loadKids(supabase, { since: addDaysKey(dayKey(), -56) }), getTeam(scope)]);
  const group = data.groups.find((g) => g.id === id);
  if (!group) notFound();

  const canManage = me.role === "direction" || me.role === "manager";
  const today = dayKey();
  const people = byId(team);
  const coach = group.coach_id ? people.get(group.coach_id) : undefined;
  const inGroup = data.members.filter((m) => m.group_id === id);
  const enrolled = inGroup.filter((m) => m.status === "inscrit");
  const waiting = inGroup.filter((m) => m.status === "attente").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const att = data.attendance.filter((a) => a.group_id === id);
  const sessions = [...new Set(att.map((a) => a.date))].sort().slice(-8);
  const rate = attendanceRate(att.filter((a) => a.date >= addDaysKey(today, -28)));
  const full = enrolled.length >= group.capacity;
  const hasToday = group.days.includes(isoDay(today));

  const kid = (m: KidsMember) => data.contactById.get(m.contact_id);
  const allRows = enrolled.map((m) => ({ m, c: kid(m) })).filter((r): r is { m: KidsMember; c: Contact } => !!r.c);
  /* Recherche (enfant, parent, téléphone) + filtre de suivi + tri */
  const q = (sp.q ?? "").trim();
  const kidRate = (cid: string) => attendanceRate(att.filter((a) => a.contact_id === cid && a.date >= addDaysKey(today, -28)));
  const suivi = sp.suivi === "faible" || sp.suivi === "nouveaux" ? sp.suivi : null;
  const tri = sp.tri === "presence" || sp.tri === "age" ? sp.tri : "nom";
  const rows = sortRows(
    allRows.filter(({ c }) => {
      const ch = data.childByContact.get(c.id);
      const p = mainParent(c, ch);
      const r = kidRate(c.id);
      return (
        matchesQuery(q, c.full_name, c.phone, p.name, p.phone, ch?.parent2_name, ch?.parent2_phone) &&
        (!suivi || (suivi === "faible" ? r !== null && r < 70 : r === null))
      );
    }),
    ({ c }) => (tri === "presence" ? kidRate(c.id) : tri === "age" ? c.birth_date : c.full_name),
    tri === "presence" ? "asc" : tri === "age" ? "desc" : "asc",
  );
  const isFiltered = hasFilters(sp, ["q", "suivi"]);
  const memberIds = new Set(inGroup.map((m) => m.contact_id));
  const pickable = data.contacts.filter((c) => !memberIds.has(c.id)).map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone }));

  return (
    <div>
      <BackLink href="/kids?v=groupes" label="Groupes Kids" />
      <PageHeader
        title={group.name}
        subtitle={`${group.activity} · ${group.age_min}-${group.age_max} ans · ${daysLabel(group.days)} · ${group.start_time}–${group.end_time}${group.location ? ` · ${group.location}` : ""}${coach ? ` · ${coach.full_name}` : ""}`}
        actions={
          <>
            {hasToday && (
              <LinkButton href="/kids" variant="brand">
                <ClipboardCheck /> Faire l&apos;appel
              </LinkButton>
            )}
            {canManage && (
              <form action={deleteGroup.bind(null, group.id)}>
                <ConfirmButton message={`Supprimer le groupe « ${group.name} », ses inscriptions et son historique de présence ?`}>
                  <Trash2 /> Supprimer
                </ConfirmButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Enfants inscrits"
              subtitle={`${enrolled.length}/${group.capacity} places${rate !== null ? ` · ${rate} % de présence sur 4 semaines` : ""}`}
              icon={<Users />}
              action={full ? <Badge tone="accent">Complet</Badge> : <Badge tone="green">{group.capacity - enrolled.length} place{group.capacity - enrolled.length > 1 ? "s" : ""}</Badge>}
            />
            {allRows.length > 0 && (
              <div className="border-t border-line px-5 pt-3">
                <ListToolbar
                  className="mb-3"
                  placeholder="Enfant, parent, téléphone…"
                  filters={[
                    { param: "suivi", label: "Tous", options: [{ value: "faible", label: "Présence < 70 %" }, { value: "nouveaux", label: "Nouveaux" }] },
                    { param: "tri", label: "Par nom", options: [{ value: "presence", label: "Présence" }, { value: "age", label: "Âge" }] },
                  ]}
                  right={<ResultCount shown={rows.length} total={allRows.length} filtered={isFiltered} unit="enfant" />}
                />
              </div>
            )}
            {allRows.length && !rows.length ? (
              <NoResults q={q} href={clearHref(`/kids/groupes/${id}`, sp, ["q", "suivi", "tri"])} what="enfant" />
            ) : rows.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {rows.map(({ m, c }) => {
                  const mine = att.filter((a) => a.contact_id === c.id);
                  const r = attendanceRate(mine.filter((a) => a.date >= addDaysKey(today, -28)));
                  const parent = mainParent(c, data.childByContact.get(c.id));
                  const wa = waLink(parent.phone, `Bonjour ${parent.name.split(" ")[0]}, ici l'équipe Moov'Up Kids (${group.name}).`);
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <ContactLink id={c.id} name={c.full_name} />
                        </p>
                        <p className="truncate text-xs text-muted">
                          {age(c.birth_date) !== null ? `${age(c.birth_date)} ans · ` : ""}
                          <Link href={`/kids/parent/${c.id}`} className="hover:text-brand-600 hover:underline">
                            {parent.name}
                          </Link>
                        </p>
                      </div>
                      <span className="flex items-center gap-1" title="8 dernières séances">
                        {sessions.map((d) => {
                          const s = mine.find((a) => a.date === d)?.status;
                          return <span key={d} title={`${fmtDate(d, { day: "numeric", month: "short" })} : ${s ?? "non pointé"}`} className={cn("size-2 rounded-full", s ? DOT[s] : "bg-slate-200")} />;
                        })}
                      </span>
                      <span className={cn("w-12 text-right text-sm font-semibold tabular-nums", r !== null && r < 70 ? "text-red-600" : "text-ink")}>{r === null ? "–" : `${r} %`}</span>
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "h-8 px-2")} title="WhatsApp au parent">
                          <WhatsAppIcon className="size-4 text-emerald-600" />
                        </a>
                      )}
                      <form action={removeMember.bind(null, m.id)}>
                        <ConfirmButton message={`Retirer ${c.full_name} du groupe ?`} className="h-8 border-0 px-2">
                          <X className="size-4" />
                          <span className="sr-only">Retirer</span>
                        </ConfirmButton>
                      </form>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty icon={<Users />} title="Aucun enfant inscrit" text="Inscrivez le premier enfant avec le formulaire." />
            )}
          </Card>

          {waiting.length > 0 && (
            <Card>
              <CardHeader title="Liste d'attente" subtitle="Par ordre d'arrivée" />
              <ul className="divide-y divide-line border-t border-line">
                {waiting.map((m, i) => {
                  const c = kid(m);
                  if (!c) return null;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-5 text-xs tabular-nums text-muted">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <ContactLink id={c.id} name={c.full_name} />
                        </p>
                        <p className="text-xs text-muted">Depuis le {fmtDate(m.joined_on, { day: "numeric", month: "short" })}</p>
                      </div>
                      <form action={promoteMember.bind(null, m.id)}>
                        <SubmitButton variant="secondary" className="h-8" pendingText="…">
                          {full ? "Inscrire (surnombre)" : "Inscrire"}
                        </SubmitButton>
                      </form>
                      <form action={removeMember.bind(null, m.id)}>
                        <ConfirmButton message={`Retirer ${c.full_name} de la liste d'attente ?`} className="h-8 border-0 px-2">
                          <X className="size-4" />
                          <span className="sr-only">Retirer</span>
                        </ConfirmButton>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Inscrire un enfant" subtitle={full ? "Groupe complet : l'enfant ira en liste d'attente" : undefined} icon={<UserPlus />} />
            <ActionForm key={inGroup.length} action={enrollChild.bind(null, group.id)} className="space-y-3 px-5 pb-5">
              <ContactPicker contacts={pickable} required placeholder="Rechercher un enfant (nom ou téléphone du parent)…" />
              {!full && (
                <label className="flex items-center gap-2 text-[13px] text-slate-700">
                  <input type="checkbox" name="waitlist" className="size-4" /> Mettre en liste d&apos;attente
                </label>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SubmitButton variant="brand">{full ? "Ajouter en liste d'attente" : "Inscrire"}</SubmitButton>
                <Link href="/contacts/nouveau" className="text-[13px] font-medium text-brand-600 hover:underline">
                  Nouvel enfant
                </Link>
              </div>
            </ActionForm>
          </Card>

          {canManage && (
            <Card>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  <Pencil className="size-4 text-slate-400" /> Modifier le groupe
                </summary>
                <div className="px-5 pb-5">
                  <GroupForm action={saveGroup.bind(null, group.id)} group={group} coaches={team.map((p) => ({ id: p.id, full_name: p.full_name }))} />
                </div>
              </details>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
