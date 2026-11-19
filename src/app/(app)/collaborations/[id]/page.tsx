import Link from "next/link";
import { notFound } from "next/navigation";
import { BellRing, CalendarRange, Check, Mail, MessageCircle, Pause, Phone, Play, SquarePen, Trash2 } from "lucide-react";
import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, fmtDate, mad, waLink } from "@/lib/utils";
import { NATURE_LABEL, PARTNER_KIND_LABEL, PARTNERSHIP_STATUS_LABEL, type Partnership } from "@/lib/types-business";
import type { Profile } from "@/lib/types";
import { deletePartnership, removePartnershipPhoto, setPartnershipStatus } from "@/actions/collaborations";
import { Badge, Card, CardHeader, DescList, Empty, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { EntityBadge } from "@/components/entity-icon";
import { Gallery } from "@/components/collaborations/gallery";
import { STATUS_TONE } from "@/components/collaborations/partnership-form";

export const metadata = { title: "Collaboration" };

export default async function CollaborationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("partnerships").select("*").eq("id", id).maybeSingle();
  const p = data as Partnership | null;
  if (!p || ((p.entity_ids ?? []).length && !p.entity_ids.some((e) => scope.allowed.some((a) => a.id === e)))) notFound();
  const { data: author } = p.created_by ? await supabase.from("profiles").select("*").eq("id", p.created_by).maybeSingle() : { data: null };

  const d = p.end_date ? daysUntil(p.end_date) : null;
  const wa = waLink(p.contact_phone, `Bonjour ${p.contact_name ?? ""}, ici le groupe Moov'Up Agadir. `.replace("  ", " "));
  const social = p.social ? (p.social.startsWith("http") ? p.social : p.social.startsWith("@") ? `https://instagram.com/${p.social.slice(1)}` : null) : null;
  const next: { s: Partnership["status"]; label: string; icon: React.ReactNode }[] =
    p.status === "discussion"
      ? [{ s: "active", label: "Activer", icon: <Play /> }]
      : p.status === "active"
        ? [{ s: "terminee", label: "Terminer", icon: <Check /> }]
        : [{ s: "active", label: "Réactiver", icon: <Play /> }];

  return (
    <div className="space-y-5">
      <PageHeader
        back={<BackLink href="/collaborations" label="Collaborations" />}
        title={p.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[p.status]} dot>
              {PARTNERSHIP_STATUS_LABEL[p.status]}
            </Badge>
            <span>
              {p.partner_name} · {PARTNER_KIND_LABEL[p.partner_kind]} · {NATURE_LABEL[p.nature]}
            </span>
          </span>
        }
        actions={
          <>
            {next.map((n) => (
              <form key={n.s} action={setPartnershipStatus.bind(null, id, n.s)}>
                <button type="submit" className={buttonClass("secondary")}>
                  {n.icon} {n.label}
                </button>
              </form>
            ))}
            {p.status === "active" && (
              <form action={setPartnershipStatus.bind(null, id, "discussion")}>
                <button type="submit" className={buttonClass("ghost")} title="Remettre en discussion">
                  <Pause />
                </button>
              </form>
            )}
            <LinkButton href={`/collaborations/${id}/modifier`} variant="brand">
              <SquarePen /> Modifier
            </LinkButton>
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Photos" subtitle={p.photos.length ? `${p.photos.length} photo${p.photos.length > 1 ? "s" : ""}` : undefined} action={<Link href={`/collaborations/${id}/modifier`} className="text-brand-600 hover:underline">Ajouter</Link>} />
            {p.photos.length ? (
              <div className="px-5 pb-5">
                <Gallery items={p.photos.map((ph, i) => ({ src: `/collaborations/${id}/photo/${i}`, label: ph.label, remove: removePartnershipPhoto.bind(null, id, i) }))} />
              </div>
            ) : (
              <Empty icon={<CalendarRange />} title="Pas encore de photo" text="Ajoutez les photos de l'événement, des publications ou du contrat signé." />
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-ink">Conditions et contreparties</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Nous apportons</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{p.our_part ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Le partenaire apporte</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{p.their_part ?? "—"}</p>
              </div>
            </div>
          </Card>

          {(p.results || p.notes) && (
            <Card className="p-5">
              {p.results && (
                <>
                  <h3 className="text-sm font-semibold text-ink">Résultats</h3>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{p.results}</p>
                </>
              )}
              {p.notes && (
                <>
                  <h3 className="mt-4 text-sm font-semibold text-ink first:mt-0">Notes</h3>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{p.notes}</p>
                </>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <DescList
              items={[
                ["Début", p.start_date ? fmtDate(p.start_date) : "—"],
                [
                  "Fin",
                  p.end_date ? (
                    <span>
                      {fmtDate(p.end_date)}
                      {d !== null && p.status === "active" && <span className="block text-xs font-normal text-muted">{d < 0 ? `dépassée de ${-d} j` : d === 0 ? "aujourd'hui" : `dans ${d} j`}</span>}
                    </span>
                  ) : (
                    "—"
                  ),
                ],
                ["Valeur estimée", p.value_mad ? <span className="tabular-nums">{mad(Number(p.value_mad))}</span> : "—"],
                [
                  "Établissements",
                  (p.entity_ids ?? []).length ? (
                    <span className="flex flex-wrap justify-end gap-1">
                      {p.entity_ids.map((e) => (
                        <EntityBadge key={e} id={e} />
                      ))}
                    </span>
                  ) : (
                    "Tout le groupe"
                  ),
                ],
                ["Créée par", (author as Profile | null)?.full_name ?? "—"],
              ]}
            />
            {p.reminder_date && p.status !== "terminee" && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
                <BellRing className="size-4 text-slate-400" /> Rappel le {fmtDate(p.reminder_date)} dans les tâches
              </p>
            )}
          </Card>

          {(p.contact_name || p.contact_phone || p.contact_email || p.social) && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-ink">Contact</h3>
              <p className="mt-1 text-[13px] text-slate-700">{p.contact_name ?? p.partner_name}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
                {p.contact_phone && (
                  <a href={`tel:${p.contact_phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-ink">
                    <Phone className="size-3.5 text-slate-400" /> <span className="tabular-nums">{p.contact_phone}</span>
                  </a>
                )}
                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:underline">
                    <MessageCircle className="size-3.5" /> WhatsApp
                  </a>
                )}
                {p.contact_email && (
                  <a href={`mailto:${p.contact_email}`} className="inline-flex min-w-0 items-center gap-1.5 text-slate-600 hover:text-ink">
                    <Mail className="size-3.5 shrink-0 text-slate-400" /> <span className="truncate">{p.contact_email}</span>
                  </a>
                )}
                {p.social &&
                  (social ? (
                    <a href={social} target="_blank" rel="noreferrer" className="truncate text-brand-600 hover:underline">
                      {p.social}
                    </a>
                  ) : (
                    <span className="truncate text-slate-600">{p.social}</span>
                  ))}
              </div>
            </Card>
          )}

          <form action={deletePartnership.bind(null, id)}>
            <ConfirmButton message={`Supprimer définitivement la collaboration « ${p.title} » et ses photos ?`} className="w-full">
              <Trash2 /> Supprimer
            </ConfirmButton>
          </form>
        </div>
      </div>
    </div>
  );
}
