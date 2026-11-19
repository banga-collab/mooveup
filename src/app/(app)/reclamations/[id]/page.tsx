import { notFound } from "next/navigation";
import { CheckCircle2, Hand, ListChecks, MapPin, MessageCircle, Phone, QrCode, Save } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTeam } from "@/lib/data";
import { entity } from "@/lib/entities";
import { fmtDate, fmtTime, waLink } from "@/lib/utils";
import { COMPLAINT_PRIORITY_LABEL, COMPLAINT_STATUS_LABEL, COMPLAINT_TYPE_LABEL, durationLabel, type Complaint } from "@/lib/types-business";
import { resolveComplaint, takeComplaint, updateComplaint } from "@/actions/complaints";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, DescList, Field, PageHeader, Select, Textarea, buttonClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { EntityBadge } from "@/components/entity-icon";
import { PRIORITY_TONE, STATUS_TONE } from "@/components/complaints/tones";

export const metadata = { title: "Réclamation" };

const when = (iso: string) => `${fmtDate(iso, { day: "numeric", month: "short" })} à ${fmtTime(iso)}`;

export default async function ReclamationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, scope, me] = await Promise.all([params, getScope(), getProfile()]);
  const supabase = await createClient();
  const { data } = await supabase.from("complaints").select("*").eq("id", id).maybeSingle();
  const c = data as Complaint | null;
  if (!c || !scope.allowed.some((e) => e.id === c.entity_id)) notFound();
  const team = await getTeam({ ...scope, ids: [c.entity_id] });
  const assignee = team.find((p) => p.id === c.assigned_to);
  const wa = waLink(c.contact_phone, `Bonjour ${c.contact_name ?? ""}, ici ${entity(c.entity_id)?.short ?? "Moov'Up"}. Merci pour votre signalement ${c.ref} : `.replace("  ", " "));
  const done = c.status === "resolue";

  return (
    <div className="space-y-5">
      <PageHeader
        back={<BackLink href="/reclamations" label="Réclamations" />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{c.ref}</span>
            <Badge tone={STATUS_TONE[c.status]} dot>
              {COMPLAINT_STATUS_LABEL[c.status]}
            </Badge>
          </span>
        }
        subtitle={`${COMPLAINT_TYPE_LABEL[c.type]} · ${entity(c.entity_id)?.short ?? ""}${c.zone_label ? ` · ${c.zone_label}` : ""}`}
        actions={
          !done ? (
            <>
              {c.status === "nouvelle" && (
                <form action={takeComplaint.bind(null, c.id)}>
                  <button type="submit" className={buttonClass("secondary")}>
                    <Hand /> Je m&apos;en occupe
                  </button>
                </form>
              )}
              <form action={resolveComplaint.bind(null, c.id, `/reclamations/${c.id}`)}>
                <button type="submit" className={buttonClass("brand")}>
                  <CheckCircle2 /> Marquer résolue
                </button>
              </form>
            </>
          ) : undefined
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="space-y-5">
          <Card className="p-5">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{c.description}</p>
            {c.photo_url && (
              <a href={`/reclamations/${c.id}/photo`} target="_blank" rel="noreferrer" className="mt-4 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/reclamations/${c.id}/photo`} alt="Photo jointe au signalement" className="max-h-[420px] w-full rounded-lg border border-line bg-slate-50 object-contain" />
              </a>
            )}
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <EntityBadge id={c.entity_id} />
              {c.zone_label && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> {c.zone_label}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                {c.source === "qr" ? <QrCode className="size-3" /> : null} {c.source === "qr" ? "Signalée par QR code" : "Saisie par l'équipe"}
              </span>
            </p>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-ink">Suivi</h3>
            <ActionForm action={updateComplaint.bind(null, c.id)} className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
                <Field label="Statut">
                  <Select name="status" defaultValue={c.status}>
                    {Object.entries(COMPLAINT_STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Priorité">
                  <Select name="priority" defaultValue={c.priority}>
                    {Object.entries(COMPLAINT_PRIORITY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Assignée à">
                  <Select name="assigned_to" defaultValue={c.assigned_to ?? ""}>
                    <option value="">Personne</option>
                    {c.assigned_to && !assignee && <option value={c.assigned_to}>Membre actuel</option>}
                    {team.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                        {p.id === me.id ? " (moi)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Ce qui a été fait" hint="Obligatoire pour passer en « Résolue »">
                <Textarea name="resolution" defaultValue={c.resolution ?? ""} placeholder="Ex. : technicien passé, résistance du chauffe-eau changée" className="min-h-[72px]" />
              </Field>
              <div className="flex justify-end">
                <SubmitButton variant="brand">
                  <Save className="size-4" /> Enregistrer
                </SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <DescList
              items={[
                ["Signalée", when(c.created_at)],
                ["Prise en charge", c.taken_at ? `${when(c.taken_at)} · ${durationLabel(c.created_at, c.taken_at)}` : "—"],
                ["Résolue", c.resolved_at ? when(c.resolved_at) : "—"],
                ["Délai de traitement", c.resolved_at ? durationLabel(c.created_at, c.resolved_at) : `${durationLabel(c.created_at, new Date().toISOString())} (en cours)`],
                ["Priorité", <Badge key="p" tone={PRIORITY_TONE[c.priority]}>{COMPLAINT_PRIORITY_LABEL[c.priority]}</Badge>],
                ["Responsable", assignee?.full_name ?? (c.assigned_to ? "Membre de l'équipe" : "—")],
              ]}
            />
            {c.task_id && (
              <a href="/taches" className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600 hover:text-ink">
                <ListChecks className="size-4 text-slate-400" /> Tâche liée dans « Tâches » ({done ? "terminée" : "à faire"})
              </a>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-ink">Client</h3>
            {c.contact_name || c.contact_phone ? (
              <>
                <p className="mt-1 text-[13px] text-slate-700">{c.contact_name ?? "Client"}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
                  {c.contact_phone && (
                    <a href={`tel:${c.contact_phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-ink">
                      <Phone className="size-3.5 text-slate-400" /> <span className="tabular-nums">{c.contact_phone}</span>
                    </a>
                  )}
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:underline">
                      <MessageCircle className="size-3.5" /> Répondre sur WhatsApp
                    </a>
                  )}
                </div>
              </>
            ) : (
              <p className="mt-1 text-[13px] text-muted">Signalement anonyme.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
