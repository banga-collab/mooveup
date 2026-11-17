import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ChevronRight, FileText, Megaphone, Plus, Send, Users } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import type { EntityId } from "@/lib/entities";
import type { Campaign, Profile } from "@/lib/types";
import { fmtDate, fmtTime } from "@/lib/utils";
import { SolidTile } from "@/components/stat-tile";
import { Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";
import { ChannelMark, StatusBadge } from "@/components/campaigns/channel";
import { parseSegment } from "@/components/campaigns/shared";
import { resolveRecipients } from "@/components/campaigns/recipients";

export const metadata = { title: "Campagnes" };

export default async function CampaignsPage() {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
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
  const nextScheduled = [...scheduled].sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""))[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campagnes"
        subtitle="Messages groupés WhatsApp, SMS et e-mail vers vos clients"
        actions={
          <LinkButton href="/campagnes/nouvelle">
            <Plus className="size-4" /> Nouvelle campagne
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile tone="green" label="Envoyées" value={sent.length} sub={`${reached} messages au total`} icon={<Send />} watermark={<Send />} />
        <SolidTile tone="accent" label="Programmées" value={scheduled.length} sub={nextScheduled?.scheduled_at ? `Prochaine : ${fmtDate(nextScheduled.scheduled_at, { day: "numeric", month: "short" })} à ${fmtTime(nextScheduled.scheduled_at)}` : "Aucun envoi prévu"} icon={<CalendarClock />} watermark={<CalendarClock />} />
        <SolidTile tone="violet" label="Brouillons" value={drafts.length} sub="Prêts à être finalisés" icon={<FileText />} watermark={<FileText />} />
        <SolidTile tone="brand" label="Clients touchés" value={reached} sub={sent.length ? `${Math.round(reached / sent.length)} en moyenne par campagne` : "Pas encore d'envoi"} icon={<Users />} watermark={<Users />} />
      </div>

      <Card className="overflow-hidden">
        {campaigns.length ? (
          <ul className="divide-y divide-line">
            {campaigns.map((c, i) => {
              const author = c.created_by ? authors.get(c.created_by) : undefined;
              const when =
                c.status === "envoyee" && c.sent_at
                  ? `Envoyée le ${fmtDate(c.sent_at)} à ${fmtTime(c.sent_at)}`
                  : c.status === "programmee" && c.scheduled_at
                    ? `Prévue le ${fmtDate(c.scheduled_at)} à ${fmtTime(c.scheduled_at)}`
                    : `Créée le ${fmtDate(c.created_at)}`;
              return (
                <li key={c.id}>
                  <Link href={`/campagnes/${c.id}`} className="group flex items-center gap-3 px-4 py-4 transition hover:bg-canvas/70 sm:gap-4 sm:px-5">
                    <ChannelMark channel={c.channel} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-display text-[15px] font-bold text-ink">{c.name}</p>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="mt-0.5 truncate text-sm text-slate-600">{c.message}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <EntityDots ids={c.segment.entity_ids} />
                        <span>{when}</span>
                        {author && <span className="hidden sm:inline">· par {author.full_name}</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-xl font-extrabold text-brand-600">{counts[i]}</p>
                      <p className="text-[11px] font-medium text-muted">{c.status === "envoyee" ? "envoyés" : "ciblés"}</p>
                    </div>
                    <ChevronRight className="hidden size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500 sm:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            icon={<Megaphone className="size-6" />}
            title="Aucune campagne"
            text="Relancez les abonnements qui expirent, annoncez une offre ou souhaitez un anniversaire en quelques clics."
            action={
              <LinkButton href="/campagnes/nouvelle">
                <Plus className="size-4" /> Créer une campagne
              </LinkButton>
            }
          />
        )}
      </Card>
    </div>
  );
}
