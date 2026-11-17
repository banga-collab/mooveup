import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ChevronRight, FileText, Megaphone, Plus, Send, Users } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import type { EntityId } from "@/lib/entities";
import type { Campaign, Profile } from "@/lib/types";
import { CHANNEL_LABEL, fmtDate, fmtTime } from "@/lib/utils";
import { SolidTile } from "@/components/stat-tile";
import { Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";
import { ChannelMark, StatusBadge } from "@/components/campaigns/channel";
import { STATUS_META, parseSegment } from "@/components/campaigns/shared";
import { resolveRecipients } from "@/components/campaigns/recipients";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { NoResults, ResultCount, clearHref, entityFilter, sortRows } from "@/components/reports/list-kit";

export const metadata = { title: "Campagnes" };

type SP = { q?: string; statut?: string; canal?: string; etab?: string; tri?: string };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [me, scope, sp] = await Promise.all([getProfile(), getScope(), searchParams]);
  if (me.role === "staff") redirect("/");
  const supabase = await createClient();
  const allowed = scope.allowed.map((e) => e.id) as EntityId[];

  const [{ data: rows }, { data: people }] = await Promise.all([
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("*"),
  ]);
  const authors = byId(people as Profile[]);
  const campaigns = ((rows ?? []) as Campaign[])
    .map((c) => ({ ...c, segment: parseSegment(c.segment) }))
    .filter((c) => !c.segment.entity_ids.length || c.segment.entity_ids.some((e) => scope.ids.includes(e)));

  // Destinataires : nombre réel pour les envois, estimation en direct pour les autres
  const counts = await Promise.all(campaigns.map(async (c) => (c.status === "envoyee" ? c.recipients_count : (await resolveRecipients(c.segment, c.channel, allowed)).length)));

  const sent = campaigns.filter((c) => c.status === "envoyee");
  const scheduled = campaigns.filter((c) => c.status === "programmee");
  const drafts = campaigns.filter((c) => c.status === "brouillon");
  const reached = sent.reduce((a, c) => a + c.recipients_count, 0);
  // Recherche (nom, message, auteur) + filtres statut / canal / établissement + tri
  const q = (sp.q ?? "").trim();
  const statut = sp.statut && sp.statut in STATUS_META ? sp.statut : "";
  const canal = sp.canal && sp.canal in CHANNEL_LABEL ? sp.canal : "";
  const ents = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const etab = ents.some((e) => e.id === sp.etab) ? sp.etab! : "";
  const withCount = campaigns.map((c, i) => ({ c, n: counts[i] ?? 0 }));
  const matched = withCount.filter(
    ({ c }) =>
      (!statut || c.status === statut) &&
      (!canal || c.channel === canal) &&
      (!etab || !c.segment.entity_ids.length || c.segment.entity_ids.includes(etab as EntityId)) &&
      matchesQuery(q, c.name, c.message, c.created_by ? authors.get(c.created_by)?.full_name : null, CHANNEL_LABEL[c.channel]),
  );
  const tri = sp.tri ?? "";
  const list =
    tri === "nom"
      ? sortRows(matched, (x) => x.c.name, "asc")
      : tri === "destinataires"
        ? sortRows(matched, (x) => x.n, "desc")
        : tri === "anciennes"
          ? [...matched].reverse()
          : matched;
  const filtering = !!(q || statut || canal || etab);
  const nextScheduled = [...scheduled].sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""))[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Campagnes"
        subtitle="Messages groupés WhatsApp, SMS et e-mail"
        actions={
          <LinkButton variant="brand" href="/campagnes/nouvelle">
            <Plus /> Nouvelle campagne
          </LinkButton>
        }
      />

      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
          <SolidTile label="Envoyées" value={sent.length} sub={`${reached} messages`} icon={<Send />} />
          <SolidTile
            label="Programmées"
            value={scheduled.length}
            sub={nextScheduled?.scheduled_at ? `Prochaine le ${fmtDate(nextScheduled.scheduled_at, { day: "numeric", month: "short" })}` : "Aucun envoi prévu"}
            icon={<CalendarClock />}
          />
          <SolidTile label="Brouillons" value={drafts.length} sub="À finaliser" icon={<FileText />} />
          <SolidTile label="Clients touchés" value={reached} sub={sent.length ? `${Math.round(reached / sent.length)} par campagne` : "Pas encore d'envoi"} icon={<Users />} />
        </div>
      )}

      {campaigns.length > 0 && (
        <ListToolbar
          placeholder="Nom, message, auteur…"
          className="mb-0"
          filters={[
            { param: "statut", label: "Tous statuts", options: (Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((k) => ({ value: k, label: STATUS_META[k].label, count: campaigns.filter((c) => c.status === k).length })) },
            { param: "canal", label: "Tous canaux", options: Object.entries(CHANNEL_LABEL).map(([k, v]) => ({ value: k, label: v })) },
            ...entityFilter(ents),
            { param: "tri", label: "Plus récentes", options: [{ value: "anciennes", label: "Plus anciennes" }, { value: "nom", label: "Nom" }, { value: "destinataires", label: "Destinataires" }] },
          ]}
          right={<ResultCount shown={list.length} total={campaigns.length} filtered={filtering} unit="campagne" />}
        />
      )}

      <Card className="overflow-hidden">
        {campaigns.length && !list.length ? (
          <NoResults q={q} href={clearHref("/campagnes", sp, ["q", "statut", "canal", "etab"])} what="campagne" />
        ) : campaigns.length ? (
          <ul className="divide-y divide-line">
            {list.map(({ c, n }) => {
              const author = c.created_by ? authors.get(c.created_by) : undefined;
              const when =
                c.status === "envoyee" && c.sent_at
                  ? `Envoyée le ${fmtDate(c.sent_at)} à ${fmtTime(c.sent_at)}`
                  : c.status === "programmee" && c.scheduled_at
                    ? `Prévue le ${fmtDate(c.scheduled_at)} à ${fmtTime(c.scheduled_at)}`
                    : `Créée le ${fmtDate(c.created_at)}`;
              return (
                <li key={c.id}>
                  <Link
                    href={`/campagnes/${c.id}`}
                    className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50/70 focus-visible:bg-slate-50 focus-visible:outline-none sm:gap-4 sm:px-5"
                  >
                    <ChannelMark channel={c.channel} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-muted">{c.message}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <EntityDots ids={c.segment.entity_ids} />
                        <span>{when}</span>
                        {author && <span className="hidden sm:inline">· {author.full_name}</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-semibold tabular-nums text-ink">{n}</p>
                      <p className="text-xs text-muted">{c.status === "envoyee" ? "envoyés" : "ciblés"}</p>
                    </div>
                    <ChevronRight className="hidden size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 sm:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            icon={<Megaphone />}
            title="Aucune campagne"
            text="Relancez les abonnements qui expirent, annoncez une offre ou souhaitez un anniversaire."
            action={
              <LinkButton variant="brand" href="/campagnes/nouvelle">
                <Plus /> Créer une campagne
              </LinkButton>
            }
          />
        )}
      </Card>
    </div>
  );
}
