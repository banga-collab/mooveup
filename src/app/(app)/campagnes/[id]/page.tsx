import { notFound, redirect } from "next/navigation";
import { Copy, ExternalLink, Mail, MessageSquareText, Send, Trash2, Undo2, Users } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { EntityId } from "@/lib/entities";
import type { Campaign, Profile } from "@/lib/types";
import { CHANNEL_LABEL, fmtDate, fmtTime, waLink } from "@/lib/utils";
import { deleteCampaign, sendCampaign, unscheduleCampaign } from "@/actions/campaigns";
import { Avatar, Card, CardHeader, DescList, Empty, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { EntityBadge } from "@/components/entity-icon";
import { ChannelBadge, ChannelIcon, MessageBubble, StatusBadge } from "@/components/campaigns/channel";
import { describeSegment, firstName, parseSegment, personalize } from "@/components/campaigns/shared";
import { resolveRecipients } from "@/components/campaigns/recipients";
import { ConfirmSubmit } from "@/components/campaigns/confirm-submit";
import { ContactLink } from "@/components/quick-view/contact-link";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { NoResults, ResultCount, clearHref, entityFilter } from "@/components/reports/list-kit";

export const metadata = { title: "Campagne" };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; etab?: string }> }) {
  const [{ id }, me, scope, sp] = await Promise.all([params, getProfile(), getScope(), searchParams]);
  if (me.role === "staff") redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const raw = data as Campaign;
  const c = { ...raw, segment: parseSegment(raw.segment) };
  const allowed = scope.allowed.map((e) => e.id) as EntityId[];
  if (c.segment.entity_ids.length && !c.segment.entity_ids.some((e) => allowed.includes(e))) notFound();

  const [recipients, { data: author }] = await Promise.all([
    resolveRecipients(c.segment, c.channel, allowed),
    c.created_by ? supabase.from("profiles").select("*").eq("id", c.created_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const creator = author as Profile | null;
  const sent = c.status === "envoyee";
  const first = recipients[0];
  const sample = personalize(c.message, first ? firstName(first.full_name) : "Salma", first?.entity_short ?? "Moov'Up");
  // Recherche dans les destinataires (nom, téléphone, e-mail) + établissement
  const q = (sp.q ?? "").trim();
  const recEntities = scope.allowed.filter((e) => recipients.some((r) => r.entity_id === e.id));
  const etab = recEntities.some((e) => e.id === sp.etab) ? sp.etab! : "";
  const matched = recipients.filter((r) => (!etab || r.entity_id === etab) && matchesQuery(q, r.full_name, r.phone, r.email, r.entity_short));
  const shown = matched.slice(0, 300);

  const timeline: [string, string][] = [
    ["Créée", `${fmtDate(c.created_at)}${creator ? ` · ${creator.full_name}` : ""}`],
    ...(c.scheduled_at ? [["Programmée pour", `${fmtDate(c.scheduled_at)} à ${fmtTime(c.scheduled_at)}`] as [string, string]] : []),
    ...(c.sent_at ? [["Envoyée", `${fmtDate(c.sent_at)} à ${fmtTime(c.sent_at)}`] as [string, string]] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        back={<BackLink href="/campagnes" label="Campagnes" />}
        title={c.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            <ChannelBadge channel={c.channel} />
          </span>
        }
        actions={
          <>
            {!sent && (
              <form action={deleteCampaign.bind(null, c.id)}>
                <ConfirmSubmit variant="danger" message="Supprimer cette campagne ?">
                  <Trash2 /> Supprimer
                </ConfirmSubmit>
              </form>
            )}
            <LinkButton href={`/campagnes/nouvelle?depuis=${c.id}`} variant="secondary">
              <Copy /> Dupliquer
            </LinkButton>
            {!sent && c.status === "programmee" && (
              <form action={unscheduleCampaign.bind(null, c.id)}>
                <ConfirmSubmit variant="secondary">
                  <Undo2 /> Repasser en brouillon
                </ConfirmSubmit>
              </form>
            )}
            {!sent && recipients.length > 0 && (
              <form action={sendCampaign.bind(null, c.id)}>
                <ConfirmSubmit variant="brand" message={`Envoyer cette campagne à ${recipients.length} destinataire(s) maintenant ?`}>
                  <Send /> Envoyer maintenant
                </ConfirmSubmit>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
        <Card className="overflow-hidden">
          <CardHeader
            title={
              <>
                Destinataires <span className="ml-1 font-semibold tabular-nums text-muted">{sent ? c.recipients_count : recipients.length}</span>
              </>
            }
            subtitle={
              sent
                ? `${c.recipients_count} messages envoyés · segment actuel : ${recipients.length} contact${recipients.length > 1 ? "s" : ""}`
                : `Chaque lien ouvre ${c.channel === "email" ? "votre messagerie" : CHANNEL_LABEL[c.channel]} avec le message personnalisé`
            }
            icon={<Users />}
          />
          {recipients.length > 0 && (
            <div className="border-t border-line px-4 pt-3 sm:px-5">
              <ListToolbar
                placeholder="Nom, téléphone, e-mail…"
                className="mb-3"
                filters={entityFilter(recEntities, Object.fromEntries(recEntities.map((e) => [e.id, recipients.filter((r) => r.entity_id === e.id).length])))}
                right={<ResultCount shown={matched.length} total={recipients.length} filtered={!!(q || etab)} unit="contact" />}
              />
            </div>
          )}
          {!shown.length && recipients.length ? (
            <NoResults q={q} href={clearHref(`/campagnes/${c.id}`, sp, ["q", "etab"])} what="destinataire" />
          ) : shown.length ? (
            <ul className="max-h-[640px] divide-y divide-line overflow-y-auto border-t border-line">
              {shown.map((r) => {
                const text = personalize(c.message, firstName(r.full_name), r.entity_short);
                const href =
                  c.channel === "whatsapp"
                    ? waLink(r.phone, text)
                    : c.channel === "sms"
                      ? r.phone
                        ? `sms:${r.phone.replace(/\s/g, "")}?body=${encodeURIComponent(text)}`
                        : null
                      : r.email
                        ? `mailto:${r.email}?subject=${encodeURIComponent(c.name)}&body=${encodeURIComponent(text)}`
                        : null;
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <Avatar name={r.full_name} size={32} />
                    <div className="min-w-0 flex-1">
                      <ContactLink id={r.id} name={r.full_name} className="block truncate text-sm" />
                      <p className="truncate text-xs tabular-nums text-muted">{c.channel === "email" ? r.email : r.phone}</p>
                    </div>
                    <span className="hidden sm:block">
                      <EntityBadge id={r.entity_id} />
                    </span>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClass("secondary", "h-9 px-3")}
                        title={`Ouvrir ${CHANNEL_LABEL[c.channel]}`}
                        aria-label={`Envoyer à ${r.full_name} via ${CHANNEL_LABEL[c.channel]}`}
                      >
                        {c.channel === "email" ? <Mail /> : c.channel === "sms" ? <MessageSquareText /> : <ChannelIcon channel="whatsapp" />}
                        <span className="hidden sm:inline">Envoyer</span>
                        <ExternalLink className="!size-3 text-slate-400" />
                      </a>
                    )}
                  </li>
                );
              })}
              {matched.length > shown.length && <li className="px-5 py-3 text-center text-xs text-muted">… et {matched.length - shown.length} autres</li>}
            </ul>
          ) : (
            <Empty icon={<Users />} title="Aucun destinataire" text="Aucun contact ne correspond à ce segment pour le moment." />
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Message" subtitle="Aperçu pour le premier destinataire" />
            <div className="space-y-3 px-5 pb-5">
              <MessageBubble channel={c.channel} text={sample} sender={first?.entity_short ?? "Moov'Up"} time={c.sent_at ? fmtTime(c.sent_at) : c.scheduled_at ? fmtTime(c.scheduled_at) : "10:30"} />
              <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-600">{c.message}</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Segment" subtitle="Qui reçoit cette campagne" />
            <div className="space-y-3 px-5 pb-5">
              {c.segment.entity_ids.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {c.segment.entity_ids.map((e) => (
                    <EntityBadge key={e} id={e} />
                  ))}
                </div>
              )}
              <ul className="space-y-1.5">
                {describeSegment(c.segment, c.channel).map((d) => (
                  <li key={d} className="flex items-start gap-2 text-[13px] text-slate-700">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-slate-400" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader title="Historique" />
            <div className="px-5 pb-3">
              <DescList items={timeline} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
