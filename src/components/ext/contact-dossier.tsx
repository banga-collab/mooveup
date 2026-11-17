import Link from "next/link";
import { CalendarPlus, Camera, ClipboardList, FileHeart, FileSignature, Lock, Printer, Trash2, TriangleAlert } from "lucide-react";
import type { ContactTabProps } from "./types";
import { createClient } from "@/lib/supabase/server";
import { byId, getTeam } from "@/lib/data";
import { entity, type EntityId } from "@/lib/entities";
import type { Appointment, Profile } from "@/lib/types";
import { dayKey, fmtDate, isoToAgadir } from "@/lib/utils";
import {
  CARE_ENTITIES,
  canSeeMedical,
  careAlerts,
  CONSENT_LABEL,
  consentFor,
  PHOTOTYPES,
  PREGNANCY_LABEL,
  SKIN_LABEL,
  TREATMENT_LABEL,
  needsRecord,
  ZONES,
  type CarePhoto,
  type CareProfile,
  type Consent,
  type ConsentTemplate,
  type TreatmentRecord,
} from "@/lib/types-care";
import { addCarePhotos, createTreatment, deleteCarePhoto, deleteConsent, deleteTreatment, saveCareProfile, signConsent } from "@/actions/care";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { ImageInput } from "@/components/image-input";
import { EntityBadge } from "@/components/entity-icon";
import { Badge, buttonClass, Card, CardHeader, Empty, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { DossierTabs } from "@/components/care/dossier-tabs";
import { TreatmentForm, type PendingAppt, type PrevRecord } from "@/components/care/treatment-form";
import { ConsentForm } from "@/components/care/consent-form";
import { PhotoCompare } from "@/components/care/photo-compare";
import { photoSources } from "@/components/care/photo-src";
import { KidsChildPanel } from "@/components/kids/child-panel";

/** Onglet « Dossier » de la fiche client : soins (clinique, institut, barbier) ou fiche enfant (Kids) */
export async function ContactDossier({ contact, scope, me }: ContactTabProps) {
  const isKid = contact.entity_ids.includes("kids") && scope.allowed.some((e) => e.id === "kids");
  const isCare = contact.entity_ids.some((e) => CARE_ENTITIES.includes(e));

  if (!isKid && !isCare) {
    return (
      <Card>
        <Empty
          icon={<FileHeart />}
          title="Pas de dossier pour ce client"
          text="Le dossier (fiche santé, séances, consentements, photos) concerne les clients d'Anais Clinic, d'Anais Institut et d'Evolve, la fiche parents ceux de Moov'Up Kids. Il s'ouvre dès le premier rendez-vous dans l'un de ces établissements."
          action={
            <LinkButton href={`/agenda/nouveau?contact=${contact.id}`} variant="brand">
              <CalendarPlus /> Prendre rendez-vous
            </LinkButton>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {isKid && <KidsChildPanel contact={contact} />}
      {isCare && <CareDossier contact={contact} scope={scope} me={me} />}
    </div>
  );
}

async function CareDossier({ contact, scope, me }: ContactTabProps) {
  const medical = canSeeMedical(me);
  const base: EntityId[] = medical ? CARE_ENTITIES : ["evolve"];
  const careIds = base.filter((e) => scope.ids.includes(e) && contact.entity_ids.includes(e));
  const ids = careIds.length ? careIds : base.filter((e) => scope.ids.includes(e));

  if (!ids.length) {
    const hidden = base.some((e) => scope.allowed.some((a) => a.id === e));
    return (
      <Card>
        <Empty
          icon={<Lock />}
          title={hidden ? "Dossier masqué par le filtre" : "Dossier réservé"}
          text={
            hidden
              ? "Choisissez « Tous » ou l'établissement de soins dans le sélecteur du haut pour voir le dossier."
              : "Les données de soins et de santé sont réservées à l'équipe d'Anais Clinic et d'Anais Institut, et à la direction."
          }
        />
      </Card>
    );
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [profRes, recRes, consRes, photoRes, apptRes, peopleRes, team] = await Promise.all([
    medical ? supabase.from("care_profiles").select("*").eq("contact_id", contact.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("treatment_records").select("*").eq("contact_id", contact.id).in("entity_id", ids).order("performed_at", { ascending: false }),
    supabase.from("consents").select("*").eq("contact_id", contact.id).in("entity_id", ids).order("signed_at", { ascending: false }),
    supabase.from("care_photos").select("*").eq("contact_id", contact.id).in("entity_id", ids).order("taken_on"),
    supabase.from("appointments").select("*").eq("contact_id", contact.id).in("entity_id", ids).in("status", ["termine", "arrive"]).lte("starts_at", nowIso).order("starts_at", { ascending: false }).limit(20),
    supabase.from("profiles").select("*"),
    getTeam(scope),
  ]);
  const profile = profRes.data as CareProfile | null;
  const records = (recRes.data ?? []) as TreatmentRecord[];
  const consents = (consRes.data ?? []) as Consent[];
  const photos = (photoRes.data ?? []) as CarePhoto[];
  const appts = (apptRes.data ?? []) as Appointment[];
  const people = byId(peopleRes.data as Profile[]);
  const practitioners = team.filter((p) => p.entity_ids.some((e) => ids.includes(e)));
  const today = dayKey();

  const entities = ids.map((e) => ({ id: e, short: entity(e)!.short }));
  const defaultEntity = (scope.current && ids.includes(scope.current.id) ? scope.current.id : ids[0])!;

  /* Fiche technique pré-remplie : RDV terminés sans fiche + réglages de la séance précédente */
  const recorded = new Set(records.map((r) => r.appointment_id).filter(Boolean));
  const pending: PendingAppt[] = appts
    .filter((a) => !recorded.has(a.id) && needsRecord(a.service))
    .slice(0, 6)
    .map((a) => {
      const { date, time } = isoToAgadir(a.starts_at);
      return { id: a.id, entity_id: a.entity_id, service: a.service, staff_id: a.staff_id, date, time, label: `${fmtDate(a.starts_at, { day: "numeric", month: "short" })} · ${a.service}` };
    });
  const previous: Record<string, PrevRecord> = {};
  for (const r of records) if (!previous[r.service]) previous[r.service] = { kind: r.kind, zone: r.zone, product: r.product, lot: r.lot, settings: r.settings ?? {} };

  /* Consentements attendus mais non signés */
  const signed = new Set(consents.map((c) => c.template));
  const missing = [...new Set(records.map((r) => consentFor(r.kind)).filter((t): t is ConsentTemplate => !!t && !signed.has(t)))];
  const alerts = careAlerts(profile);
  const canManage = me.role === "direction" || me.role === "manager";

  const srcs = await photoSources(supabase, photos.map((p) => p.url));
  const photoList = photos.map((p) => ({ ...p, src: srcs.get(p.url) ?? p.url }));
  const zones = [...new Set(photoList.map((p) => p.zone))];

  /* ---------- Séances ---------- */
  const sessions = (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <Card>
        <CardHeader
          title="Nouvelle fiche technique"
          subtitle={pending.length ? `${pending.length} rendez-vous terminé${pending.length > 1 ? "s" : ""} sans fiche` : "Séance réalisée aujourd'hui ou plus tôt"}
          icon={<ClipboardList />}
        />
        <div className="px-5 pb-5">
          <TreatmentForm
            key={pending.map((p) => p.id).join("-") || "none"}
            action={createTreatment.bind(null, contact.id)}
            entities={entities}
            team={practitioners.map((p) => ({ id: p.id, full_name: p.full_name }))}
            appts={pending}
            previous={previous}
            defaultEntity={defaultEntity}
            today={today}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Historique des séances" subtitle={records.length ? `${records.length} séance${records.length > 1 ? "s" : ""}` : undefined} />
        {records.length ? (
          <ul className="divide-y divide-line">
            {records.map((r, i) => {
              const later = records.slice(0, i).some((x) => x.service === r.service);
              const s = r.settings ?? {};
              const settings = [s.fluence && `Fluence ${s.fluence}`, s.wavelength, s.spot && `Spot ${s.spot}`, s.quantity && `Quantité ${s.quantity}`].filter(Boolean).join(" · ");
              const who = r.practitioner_id ? people.get(r.practitioner_id)?.full_name : null;
              return (
                <li key={r.id} className="group px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
                        {r.service}
                        <Badge tone="gray">{TREATMENT_LABEL[r.kind]}</Badge>
                      </p>
                      <p className="mt-0.5 text-[13px] text-muted">{[r.zone, r.product, r.lot && `Lot ${r.lot}`, who].filter(Boolean).join(" · ") || "Sans détail"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs tabular-nums text-muted">{fmtDate(r.performed_at, { day: "numeric", month: "short", year: "2-digit" })}</span>
                      <form action={deleteTreatment.bind(null, contact.id, r.id)} className="sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                        <ConfirmButton message="Supprimer cette fiche technique ?" className="h-7 border-0 px-1.5">
                          <Trash2 className="size-3.5" />
                          <span className="sr-only">Supprimer</span>
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                  {settings && <p className="mt-1.5 inline-block rounded-md bg-slate-50 px-2 py-1 text-xs tabular-nums text-slate-600">{settings}</p>}
                  {r.observations && <p className="mt-1.5 text-[13px] text-slate-700">{r.observations}</p>}
                  {r.side_effects && <p className="mt-1 text-[13px] text-amber-700">Effets : {r.side_effects}</p>}
                  {r.next_on && !later && (
                    <p className={`mt-1 text-xs ${r.next_on < today ? "font-medium text-red-600" : "text-muted"}`}>
                      Prochaine séance conseillée : {fmtDate(r.next_on, { day: "numeric", month: "short" })}
                      {r.next_on < today && " (dépassée)"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon={<ClipboardList />} title="Aucune séance enregistrée" text="Remplissez la fiche technique après chaque soin : produit, lot, réglages et observations." />
        )}
      </Card>
    </div>
  );

  /* ---------- Fiche santé ---------- */
  const health = medical ? (
    <Card>
      <CardHeader
        title="Fiche santé-beauté"
        subtitle={
          profile
            ? `Mise à jour le ${fmtDate(profile.updated_at)}${profile.updated_by && people.get(profile.updated_by) ? ` par ${people.get(profile.updated_by)!.full_name}` : ""}`
            : "À remplir lors de la première consultation"
        }
        icon={<FileHeart />}
      />
      <ActionForm action={saveCareProfile.bind(null, contact.id)} className="space-y-4 px-5 pb-5">
        <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
          <Field label="Type de peau">
            <Select name="skin_type" defaultValue={profile?.skin_type ?? ""}>
              <option value="">Non renseigné</option>
              {Object.entries(SKIN_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phototype" hint="Échelle de Fitzpatrick (laser)">
            <Select name="phototype" defaultValue={profile?.phototype ? String(profile.phototype) : ""}>
              <option value="">Non renseigné</option>
              {PHOTOTYPES.map((p) => (
                <option key={p} value={p}>
                  Phototype {["I", "II", "III", "IV", "V", "VI"][p - 1]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Grossesse / allaitement">
            <Select name="pregnancy" defaultValue={profile?.pregnancy ?? "non"}>
              {Object.entries(PREGNANCY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Contre-indications" hint="Affichées en alerte en haut du dossier">
            <Textarea name="contraindications" rows={2} defaultValue={profile?.contraindications ?? ""} placeholder="Ex. isotrétinoïne, herpès, anticoagulants…" className="min-h-[72px]" />
          </Field>
          <Field label="Allergies" hint="Affichées en alerte en haut du dossier">
            <Textarea name="allergies" rows={2} defaultValue={profile?.allergies ?? ""} placeholder="Ex. lidocaïne, latex…" className="min-h-[72px]" />
          </Field>
          <Field label="Traitements en cours">
            <Textarea name="treatments" rows={2} defaultValue={profile?.treatments ?? ""} className="min-h-[72px]" />
          </Field>
          <Field label="Antécédents">
            <Textarea name="history" rows={2} defaultValue={profile?.history ?? ""} placeholder="Médicaux, esthétiques, chirurgicaux" className="min-h-[72px]" />
          </Field>
        </div>
        <Field label="Notes">
          <Input name="notes" defaultValue={profile?.notes ?? ""} placeholder="Préférences, sensibilité…" />
        </Field>
        <SubmitButton variant="brand">Enregistrer la fiche</SubmitButton>
      </ActionForm>
    </Card>
  ) : (
    <Card>
      <Empty icon={<Lock />} title="Données médicales réservées" text="La fiche santé est visible uniquement par l'équipe d'Anais Clinic, d'Anais Institut et la direction." />
    </Card>
  );

  /* ---------- Consentements ---------- */
  const consentTab = (
    <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
      <Card>
        <CardHeader title="Faire signer un consentement" subtitle="Sur la tablette ou le téléphone, au doigt" icon={<FileSignature />} />
        <div className="space-y-4 px-5 pb-5">
          {missing.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
              À faire signer :
              {missing.map((m) => (
                <Badge key={m} tone="red">
                  {CONSENT_LABEL[m]}
                </Badge>
              ))}
            </p>
          )}
          <ConsentForm
            key={consents.length}
            action={signConsent.bind(null, contact.id)}
            signer={contact.full_name}
            entities={entities}
            defaultEntity={defaultEntity}
            defaultTemplate={missing[0] ?? (contact.entity_ids.includes("clinic") ? "laser" : "soin")}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Consentements signés" subtitle={consents.length ? `${consents.length} document${consents.length > 1 ? "s" : ""}` : undefined} />
        {consents.length ? (
          <ul className="divide-y divide-line">
            {consents.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.signature} alt="Signature" className="h-10 w-20 shrink-0 rounded border border-line bg-white object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{CONSENT_LABEL[c.template]}</p>
                  <p className="truncate text-xs text-muted">
                    {fmtDate(c.signed_at)} · {c.signed_by}
                    {c.collected_by && people.get(c.collected_by) ? ` · recueilli par ${people.get(c.collected_by)!.full_name}` : ""}
                  </p>
                </div>
                <Link href={`/dossiers/consentement/${c.id}`} className={buttonClass("ghost", "h-8 px-2")} title="Imprimer ou enregistrer en PDF">
                  <Printer />
                  <span className="sr-only">Imprimer</span>
                </Link>
                {canManage && (
                  <form action={deleteConsent.bind(null, contact.id, c.id)}>
                    <ConfirmButton message="Supprimer ce consentement signé ?" className="h-8 border-0 px-2">
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Supprimer</span>
                    </ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<FileSignature />} title="Aucun consentement" text="Faites signer le consentement adapté avant le premier soin." />
        )}
      </Card>
    </div>
  );

  /* ---------- Photos ---------- */
  const photoTab = (
    <div className="space-y-6">
      {photoList.length > 1 && (
        <Card>
          <CardHeader title="Comparer avant / après" subtitle="Choisissez la zone puis les deux photos" icon={<Camera />} />
          <div className="px-5 pb-5">
            <PhotoCompare photos={photoList.map((p) => ({ id: p.id, kind: p.kind, zone: p.zone, taken_on: p.taken_on, src: p.src }))} />
          </div>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card>
          <CardHeader title="Ajouter des photos" subtitle="Optimisées automatiquement, sans perte visible" />
          <ActionForm key={photos.length} action={addCarePhotos.bind(null, contact.id)} className="space-y-3.5 px-5 pb-5">
            <ImageInput name="photo" multiple required label="Choisir ou prendre des photos" />
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <Field label="Moment">
                <Select name="kind" defaultValue={photos.some((p) => p.kind === "avant") ? "apres" : "avant"}>
                  <option value="avant">Avant</option>
                  <option value="apres">Après</option>
                </Select>
              </Field>
              <Field label="Date">
                <Input type="date" name="taken_on" defaultValue={today} max={today} />
              </Field>
            </div>
            <Field label="Zone">
              <Input name="zone" list="photo-zones" defaultValue={zones[0] ?? ""} required placeholder="Ex. Visage" />
            </Field>
            <datalist id="photo-zones">
              {[...new Set([...zones, ...ZONES])].map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            {entities.length > 1 ? (
              <Field label="Établissement">
                <Select name="entity_id" defaultValue={defaultEntity}>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.short}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="entity_id" value={defaultEntity} />
            )}
            <SubmitButton variant="brand" pendingText="Envoi…">
              <Camera /> Enregistrer
            </SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Photos" subtitle={photoList.length ? `${photoList.length} photo${photoList.length > 1 ? "s" : ""} · ${zones.length} zone${zones.length > 1 ? "s" : ""}` : undefined} />
          {photoList.length ? (
            <div className="space-y-5 px-5 pb-5">
              {zones.map((z) => (
                <div key={z}>
                  <p className="mb-2 text-[13px] font-medium text-ink">{z}</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {photoList
                      .filter((p) => p.zone === z)
                      .map((p) => (
                        <figure key={p.id} className="min-w-0">
                          <a href={p.src} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.src} alt={`${p.kind === "avant" ? "Avant" : "Après"} · ${p.zone}`} className="aspect-[4/3] w-full rounded-lg border border-line bg-canvas object-cover" />
                          </a>
                          <figcaption className="mt-1 flex items-center justify-between gap-1 text-xs text-muted">
                            <span className="truncate">
                              {p.kind === "avant" ? "Avant" : "Après"} · {fmtDate(p.taken_on, { day: "numeric", month: "short" })}
                            </span>
                            <form action={deleteCarePhoto.bind(null, contact.id, p.id)}>
                              <ConfirmButton message="Supprimer cette photo ?" className="h-6 border-0 px-1">
                                <Trash2 className="size-3.5" />
                                <span className="sr-only">Supprimer</span>
                              </ConfirmButton>
                            </form>
                          </figcaption>
                        </figure>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<Camera />} title="Aucune photo" text="Prenez une photo avant le premier soin pour mesurer les résultats." />
          )}
        </Card>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-[13px] text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-500" />
          <p>
            <span className="font-semibold">À vérifier avant tout soin :</span> {alerts.join(" · ")}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {ids.map((e) => (
            <EntityBadge key={e} id={e} />
          ))}
          {missing.length > 0 && <Badge tone="amber">Consentement à signer : {missing.map((m) => CONSENT_LABEL[m]).join(", ")}</Badge>}
        </div>
        <Link href="/dossiers" className="text-[13px] font-medium text-brand-600 hover:underline">
          Suivis et consentements à faire
        </Link>
      </div>
      <DossierTabs
        tabs={[
          { id: "seances", label: "Séances", count: records.length, content: sessions },
          { id: "sante", label: "Fiche santé", count: alerts.length || undefined, alert: alerts.length > 0, content: health },
          { id: "consentements", label: "Consentements", count: consents.length, alert: missing.length > 0, content: consentTab },
          { id: "photos", label: "Photos", count: photos.length, content: photoTab },
        ]}
      />
    </div>
  );
}
