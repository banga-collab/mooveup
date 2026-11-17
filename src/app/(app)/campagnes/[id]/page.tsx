import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Copy, ExternalLink, Filter, Mail, MessageSquareText, Send, Trash2, Undo2, Users } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { EntityId } from "@/lib/entities";
import type { Campaign, Profile } from "@/lib/types";
import { CHANNEL_LABEL, fmtDate, fmtTime, waLink } from "@/lib/utils";
import { deleteCampaign, sendCampaign, unscheduleCampaign } from "@/actions/campaigns";
import { Avatar, Card, CardHeader, Empty, LinkButton, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { EntityBadge } from "@/components/entity-icon";
import { ChannelBadge, ChannelIcon, MessageBubble, StatusBadge } from "@/components/campaigns/channel";
import { CHANNEL_META, describeSegment, firstName, parseSegment, personalize } from "@/components/campaigns/shared";
import { resolveRecipients } from "@/components/campaigns/recipients";
import { ConfirmSubmit } from "@/components/campaigns/confirm-submit";

export const metadata = { title: "Campagne" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, me, scope] = await Promise.all([params, getProfile(), getScope()]);
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
  const meta = CHANNEL_META[c.channel];
  const first = recipients[0];
  const sample = personalize(c.message, first ? firstName(first.full_name) : "Salma", first?.entity_short ?? "Moov'Up");
  const shown = recipients.slice(0, 300);

  const timeline = [
    { label: "Créée", value: `${fmtDate(c.created_at)}${creator ? ` · ${creator.full_name}` : ""}` },
    ...(c.scheduled_at ? [{ label: "Programmée pour", value: `${fmtDate(c.scheduled_at)} à ${fmtTime(c.scheduled_at)}` }] : []),
    ...(c.sent_at ? [{ label: "Envoyée", value: `${fmtDate(c.sent_at)} à ${fmtTime(c.sent_at)}` }] : []),
  ];

  return (
    <div className="space-y-6">
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
            <LinkButton href={`/campagnes/nouvelle?depuis=${c.id}`} variant="secondary">
              <Copy className="size-4" /> Dupliquer
            </LinkButton>
            {!sent && (
              <form action={deleteCampaign.bind(null, c.id)}>
                <ConfirmSubmit variant="danger" message="Supprimer cette campagne ?">
                  <Trash2 className="size-4" /> Supprimer
                </ConfirmSubmit>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        <div className="space-y-6">
          {/* Bandeau destinataires */}
          <div className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl sm:p-6" style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)` }}>
            <ChannelIcon channel={c.channel} className="pointer-events-none absolute -bottom-6 -right-6 size-36 text-white/15" />
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-white/90">{sent ? "Messages envoyés" : "Destinataires ciblés"}</p>
                <p className="mt-1 font-display text-[44px] font-extrabold leading-none">{sent ? c.recipients_count : recipients.length}</p>
                <p className="mt-2 text-xs text-white/80">
                  {sent ? `Segment actuel : ${recipients.length} contact${recipients.length > 1 ? "s" : ""}` : "Selon le segment, à cet instant"}
                </p>
              </div>
              {!sent && (
                <div className="flex flex-wrap gap-2">
                  {c.status === "programmee" && (
                    <form action={unscheduleCampaign.bind(null, c.id)}>
                      <ConfirmSubmit variant="secondary">
                        <Undo2 className="size-4" /> Repasser en brouillon
                      </ConfirmSubmit>
                    </form>
                  )}
                  {recipients.length > 0 && (
                    <form action={sendCampaign.bind(null, c.id)}>
                      <ConfirmSubmit variant="primary" message={`Envoyer cette campagne à ${recipients.length} destinataire(s) maintenant ?`}>
                        <Send className="size-4" /> Envoyer maintenant
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Destinataires */}
          <Card>
            <CardHeader
              title="Destinataires"
              subtitle={
                c.channel === "whatsapp"
                  ? "Envoi manuel possible : chaque lien ouvre WhatsApp avec le message personnalisé"
                  : c.channel === "sms"
                    ? "Chaque lien ouvre l'application SMS avec le message personnalisé"
                    : "Chaque lien ouvre votre messagerie avec le message personnalisé"
              }
              icon={<Users className="size-4" />}
            />
            {shown.length ? (
              <ul className="max-h-[640px] divide-y divide-line overflow-y-auto px-2 pb-3">
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
                    <li key={r.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                      <Avatar name={r.full_name} size={36} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/contacts/${r.id}`} className="block truncate text-sm font-semibold hover:text-brand-600 hover:underline">
                          {r.full_name}
                        </Link>
                        <p className="truncate text-xs text-muted">{c.channel === "email" ? r.email : r.phone}</p>
                      </div>
                      <span className="hidden sm:block">
                        <EntityBadge id={r.entity_id} />
                      </span>
                      {href && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5"
                          style={{ background: meta.color }}
                          title={`Ouvrir ${CHANNEL_LABEL[c.channel]}`}
                        >
                          {c.channel === "email" ? <Mail className="size-4" /> : c.channel === "sms" ? <MessageSquareText className="size-4" /> : <ChannelIcon channel="whatsapp" className="size-4" />}
                          <span className="hidden sm:inline">Envoyer</span>
                          <ExternalLink className="size-3 opacity-70" />
                        </a>
                      )}
                    </li>
                  );
                })}
                {recipients.length > shown.length && <li className="px-3 py-3 text-center text-xs text-muted">… et {recipients.length - shown.length} autres</li>}
              </ul>
            ) : (
              <Empty icon={<Users className="size-6" />} title="Aucun destinataire" text="Aucun contact ne correspond à ce segment pour le moment." />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Message</p>
            <MessageBubble channel={c.channel} text={sample} sender={first?.entity_short ?? "Moov'Up"} time={c.sent_at ? fmtTime(c.sent_at) : c.scheduled_at ? fmtTime(c.scheduled_at) : "10:30"} />
            <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-canvas px-3 py-2.5 font-mono text-xs text-slate-600">{c.message}</p>
          </Card>

          <Card>
            <CardHeader title="Segment" subtitle="Qui reçoit cette campagne" icon={<Filter className="size-4" />} />
            <div className="space-y-3 px-5 pb-5">
              <div className="flex flex-wrap gap-1.5">
                {c.segment.entity_ids.map((e) => (
                  <EntityBadge key={e} id={e} />
                ))}
              </div>
              <ul className="space-y-1.5">
                {describeSegment(c.segment, c.channel).map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-500" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader title="Historique" icon={<CalendarClock className="size-4" />} />
            <ol className="space-y-3 px-5 pb-5">
              {timeline.map((t) => (
                <li key={t.label} className="flex gap-3">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-brand-50" style={{ background: "#1a6d8e" }} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted">{t.label}</p>
                    <p className="text-sm font-medium">{t.value}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
