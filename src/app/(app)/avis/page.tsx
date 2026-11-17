import { redirect } from "next/navigation";
import { AlertCircle, Check, MessageSquareText, Percent, Send, Star, ThumbsUp, X } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getContacts } from "@/lib/data";
import { ENTITIES } from "@/lib/entities";
import type { Contact } from "@/lib/types";
import type { Review } from "@/lib/types-loyalty";
import { addDaysKey, dayKey, fmtDate, relative, waLink } from "@/lib/utils";
import { SolidTile } from "@/components/stat-tile";
import { Button, Card, CardHeader, Empty, Field, Input, LinkButton, PageHeader, Segmented, Select, tableClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ContactPicker } from "@/components/contact-picker";
import { Stars, avg, fmt1, nps } from "@/components/reviews/stars";
import { markReviewHandled, requestReview } from "@/actions/reviews";
import { ContactLink } from "@/components/quick-view/contact-link";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { NoResults, ResultCount, clearHref, entityFilter, readSort, sortRows } from "@/components/reports/list-kit";
import { SortTh } from "@/components/reports/sort-th";

export const metadata = { title: "Avis clients" };

const PERIODS = [
  { id: "30", label: "30 jours", days: 30 },
  { id: "90", label: "90 jours", days: 90 },
  { id: "tout", label: "Tout", days: 3650 },
];

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role === "staff") redirect("/");
  const period = PERIODS.find((p) => p.id === one(sp.periode)) ?? PERIODS[1]!;
  const asking = one(sp.demander) === "1";
  const supabase = await createClient();

  const since = addDaysKey(dayKey(), -period.days);
  const [{ data: rows }, { data: todoRows }] = await Promise.all([
    supabase.from("reviews").select("*").in("entity_id", scope.ids).gte("created_at", since).order("created_at", { ascending: false }),
    supabase.from("reviews").select("*").in("entity_id", scope.ids).lte("rating", 3).eq("handled", false).order("answered_at", { ascending: false }),
  ]);
  const reviews = (rows ?? []) as Review[];
  const todo = (todoRows ?? []) as Review[];
  const answered = reviews.filter((r) => r.rating !== null);
  const ratings = answered.map((r) => r.rating!);

  const ids = [...new Set([...answered, ...todo].map((r) => r.contact_id))];
  const [{ data: cRows }, pickerContacts] = await Promise.all([
    ids.length ? supabase.from("contacts").select("*").in("id", ids) : Promise.resolve({ data: [] }),
    asking ? getContacts(scope) : Promise.resolve([] as Contact[]),
  ]);
  const people = new Map(((cRows ?? []) as Contact[]).map((c) => [c.id, c]));

  // Recherche (client, commentaire, prestation, téléphone) + filtres note / établissement + tri
  const q = (one(sp.q) ?? "").trim();
  const ents = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const etab = ents.some((e) => e.id === one(sp.etab)) ? one(sp.etab)! : "";
  const note = ["1", "2", "3", "4", "5", "negatifs"].includes(one(sp.note) ?? "") ? one(sp.note)! : "";
  const tri = one(sp.tri) ?? "";
  const filtering = !!(q || etab || note);
  const keep = (r: Review) => {
    const c = people.get(r.contact_id);
    return (
      (!etab || r.entity_id === etab) &&
      (!note || (note === "negatifs" ? (r.rating ?? 5) <= 3 : r.rating === Number(note))) &&
      matchesQuery(q, c?.full_name, c?.phone, r.comment, r.service)
    );
  };
  const todoShown = todo.filter(keep);
  const withComment = answered.filter((r) => r.comment);
  const commentsAll = withComment.filter(keep);
  const commentsSorted = tri === "note-asc" ? sortRows(commentsAll, (r) => r.rating, "asc") : tri === "note-desc" ? sortRows(commentsAll, (r) => r.rating, "desc") : commentsAll;

  const byEntity = ENTITIES.filter((e) => scope.ids.includes(e.id)).map((e) => {
    const sent = reviews.filter((r) => r.entity_id === e.id);
    const rs = sent.filter((r) => r.rating !== null).map((r) => r.rating!);
    return { e, sent: sent.length, n: rs.length, avg: avg(rs), nps: nps(rs), five: rs.length ? Math.round((rs.filter((r) => r === 5).length / rs.length) * 100) : null };
  });
  const comments = commentsSorted.slice(0, filtering || tri ? 60 : 12);
  const score = nps(ratings);
  const rate = reviews.length ? Math.round((answered.length / reviews.length) * 100) : null;
  const periodHref = (id: string) => {
    const u = new URLSearchParams();
    if (id !== "90") u.set("periode", id);
    for (const k of ["q", "etab", "note", "tri"]) if (one(sp[k])) u.set(k, one(sp[k])!);
    const qs = u.toString();
    return qs ? `/avis?${qs}` : "/avis";
  };
  const entSort = readSort(sp, ["etab", "note", "avis", "nps", "five"] as const, "etab");
  const byEntitySorted = sortRows(
    byEntity,
    (x) => (entSort.key === "etab" ? x.e.short : entSort.key === "note" ? x.avg : entSort.key === "avis" ? x.n : entSort.key === "nps" ? x.nps : x.five),
    entSort.dir,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Avis clients"
        subtitle="Satisfaction après chaque visite : les bonnes notes vont sur Google, les mauvaises arrivent au manager"
        actions={
          asking ? (
            <LinkButton href="/avis" variant="secondary">
              <X /> Fermer
            </LinkButton>
          ) : (
            <LinkButton href="/avis?demander=1" variant="brand">
              <Send /> Demander un avis
            </LinkButton>
          )
        }
      />

      {asking && (
        <Card>
          <CardHeader title="Demander un avis" subtitle="Envoie un lien court par WhatsApp (note de 1 à 5 étoiles, 30 secondes)" />
          <ActionForm action={requestReview} className="grid gap-4 px-5 pb-5 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end [&>*]:min-w-0">
            <Field label="Client">
              <ContactPicker contacts={pickerContacts.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone }))} required />
            </Field>
            <Field label="Établissement">
              <Select name="entity_id" defaultValue={scope.current?.id ?? scope.allowed[0]?.id}>
                {scope.allowed.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.short}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Prestation (facultatif)">
              <Input name="service" maxLength={80} placeholder="Soin du visage" />
            </Field>
            <SubmitButton variant="brand" pendingText="Envoi…">
              Envoyer
            </SubmitButton>
          </ActionForm>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Note moyenne" value={`${fmt1(avg(ratings))} / 5`} sub={`${answered.length} avis sur ${period.label}`} icon={<Star />} />
        <SolidTile label="NPS" value={score === null ? "–" : `${score > 0 ? "+" : ""}${score}`} sub="% de 5★ moins % de 1 à 3★" icon={<ThumbsUp />} />
        <SolidTile label="Taux de réponse" value={rate === null ? "–" : `${rate} %`} sub={`${reviews.length} demandes envoyées`} icon={<Percent />} />
        <SolidTile label="Avis à traiter" value={todo.length} sub={todo.length ? "Clients à rappeler" : "Rien en attente"} icon={<AlertCircle />} href={todo.length ? "#a-traiter" : undefined} />
      </div>

      <div className="space-y-3">
        <Segmented active={period.id} items={PERIODS.map((p) => ({ id: p.id, href: periodHref(p.id), label: p.label }))} />
        <ListToolbar
          placeholder="Client, commentaire, prestation…"
          className="mb-0"
          filters={[
            {
              param: "note",
              label: "Toutes notes",
              options: [
                { value: "negatifs", label: "1 à 3★", count: answered.filter((r) => r.rating! <= 3).length },
                ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}★`, count: answered.filter((r) => r.rating === n).length })),
              ],
            },
            ...entityFilter(ents),
            { param: "tri", label: "Plus récents", options: [{ value: "note-asc", label: "Pires notes" }, { value: "note-desc", label: "Meilleures notes" }] },
          ]}
          right={<ResultCount shown={commentsAll.length + todoShown.length} total={withComment.length + todo.length} filtered={filtering} unit="avis" units="avis" />}
        />
      </div>

      {todoShown.length > 0 && (
        <Card id="a-traiter" className="overflow-hidden">
          <CardHeader title="Avis négatifs à traiter" subtitle="Rappelez le client, puis marquez l'avis comme traité" icon={<AlertCircle />} />
          <ul className="divide-y divide-line border-t border-line">
            {todoShown.map((r) => {
              const c = people.get(r.contact_id);
              const wa = c ? waLink(c.phone, `Bonjour ${c.full_name.split(" ")[0]}, merci pour votre retour. Je suis désolé(e) que votre expérience n'ait pas été à la hauteur…`) : null;
              return (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Stars value={r.rating!} />
                      {c ? (
                        <ContactLink id={c.id} name={c.full_name} className="text-sm" />
                      ) : (
                        <span className="text-sm font-medium">Client</span>
                      )}
                      <EntityBadge id={r.entity_id} />
                    </div>
                    <p className="mt-1 text-[13px] text-slate-700">{r.comment ? `« ${r.comment} »` : <span className="text-muted">Sans commentaire</span>}</p>
                    <p className="mt-1 text-xs text-muted">
                      {r.service ? `${r.service} · ` : ""}
                      {r.answered_at ? relative(r.answered_at) : ""}
                      {c?.phone ? ` · ${c.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[13px] font-medium text-slate-700 hover:border-slate-300">
                        WhatsApp
                      </a>
                    )}
                    <form action={markReviewHandled}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button variant="secondary">
                        <Check /> Traité
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
        <Card className="overflow-hidden">
          <CardHeader title="Par établissement" />
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <SortTh col="etab" label="Établissement" def />
                  <SortTh col="note" label="Note" first="desc" />
                  <SortTh col="avis" label="Avis" align="right" first="desc" />
                  <SortTh col="nps" label="NPS" align="right" first="desc" />
                  <SortTh col="five" label="5★" align="right" first="desc" className="hidden sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {byEntitySorted.map((x) => (
                  <tr key={x.e.id}>
                    <td>
                      <EntityBadge id={x.e.id} />
                    </td>
                    <td>
                      {x.avg !== null ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-semibold tabular-nums">{fmt1(x.avg)}</span>
                          <Stars value={x.avg} size={12} className="hidden sm:inline-flex" />
                        </span>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums text-slate-600">
                      {x.n}
                      <span className="text-muted">/{x.sent}</span>
                    </td>
                    <td className="text-right font-medium tabular-nums">{x.nps === null ? "–" : `${x.nps > 0 ? "+" : ""}${x.nps}`}</td>
                    <td className="hidden text-right tabular-nums text-slate-600 sm:table-cell">{x.five === null ? "–" : `${x.five} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title={filtering ? "Commentaires trouvés" : "Derniers commentaires"} subtitle={commentsAll.length > comments.length ? `${comments.length} sur ${commentsAll.length}` : undefined} icon={<MessageSquareText />} />
          {!comments.length && filtering && withComment.length ? (
            <NoResults q={q} href={clearHref("/avis", sp, ["q", "etab", "note"])} what="avis" />
          ) : comments.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {comments.map((r) => {
                const c = people.get(r.contact_id);
                return (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Stars value={r.rating!} size={12} />
                      {c ? <ContactLink id={c.id} name={c.full_name} className="truncate text-[13px]" /> : <span className="truncate text-[13px] font-medium text-ink">Client</span>}
                      <span className="ml-auto shrink-0 text-xs text-muted">{fmtDate(r.answered_at ?? r.created_at, { day: "numeric", month: "short" })}</span>
                    </div>
                    <p className="mt-1 text-[13px] text-slate-600">« {r.comment} »</p>
                    <div className="mt-1">
                      <EntityBadge id={r.entity_id} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={<MessageSquareText />} title="Pas encore de commentaire" text="Activez la règle « Remerciement et demande d'avis » dans les rappels automatiques." action={<LinkButton href="/automatisations" variant="secondary">Rappels automatiques</LinkButton>} />
          )}
        </Card>
      </div>
    </div>
  );
}
