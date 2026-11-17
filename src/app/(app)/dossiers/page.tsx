import Link from "next/link";
import { CalendarClock, CalendarPlus, ClipboardList, FileSignature, Lock } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getContacts } from "@/lib/data";
import type { EntityId } from "@/lib/entities";
import type { Appointment, Contact } from "@/lib/types";
import { addDaysKey, cn, dayKey, daysUntil, fmtDate, waLink } from "@/lib/utils";
import { CARE_ENTITIES, canSeeMedical, CONSENT_LABEL, consentFor, needsRecord, type Consent, type ConsentTemplate, type TreatmentRecord } from "@/lib/types-care";
import { SolidTile } from "@/components/stat-tile";
import { EntityBadge } from "@/components/entity-icon";
import { WhatsAppIcon } from "@/components/contacts/bits";
import { Badge, buttonClass, Card, Empty, PageHeader, Segmented } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { ContactLink } from "@/components/quick-view/contact-link";
import { NoResults, ResultCount, clearHref, entityFilter, hasFilters, sortRows } from "@/components/reports/list-kit";

export const metadata = { title: "Dossiers de soins" };

type View = "suivis" | "consentements" | "fiches";

export default async function DossiersPage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string; etab?: string; delai?: string; tri?: string }> }) {
  const [sp, me, scope] = await Promise.all([searchParams, getProfile(), getScope()]);
  const base: EntityId[] = canSeeMedical(me) ? CARE_ENTITIES : ["evolve"];
  const ids = base.filter((e) => scope.ids.includes(e));

  if (!ids.length) {
    return (
      <div>
        <PageHeader title="Dossiers de soins" />
        <Card>
          <Empty icon={<Lock />} title="Aucun établissement de soins dans votre périmètre" text="Choisissez Anais Clinic, Anais Institut ou « Tous » dans le sélecteur du haut." />
        </Card>
      </div>
    );
  }

  const view: View = sp.v === "consentements" || sp.v === "fiches" ? sp.v : "suivis";
  const supabase = await createClient();
  const today = dayKey();
  const nowIso = new Date().toISOString();
  const [{ data: recRaw }, { data: consRaw }, { data: apptRaw }, contactsList] = await Promise.all([
    supabase.from("treatment_records").select("*").in("entity_id", ids).order("performed_at", { ascending: false }),
    supabase.from("consents").select("*").in("entity_id", ids),
    supabase.from("appointments").select("*").in("entity_id", ids).gte("starts_at", new Date(Date.now() - 14 * 86_400_000).toISOString()),
    getContacts(scope),
  ]);
  const records = (recRaw ?? []) as TreatmentRecord[];
  const consents = (consRaw ?? []) as Consent[];
  const appts = (apptRaw ?? []) as Appointment[];
  const contacts = byId(contactsList as Contact[]);

  /* Suivis : dernière séance de chaque soin avec une date conseillée proche ou dépassée, sans RDV à venir */
  const upcoming = new Set(appts.filter((a) => a.starts_at >= nowIso && a.status !== "annule").map((a) => a.contact_id));
  const seen = new Set<string>();
  const followUps: TreatmentRecord[] = [];
  for (const r of records) {
    const k = `${r.contact_id}:${r.service}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (r.next_on && r.next_on <= addDaysKey(today, 7) && r.next_on >= addDaysKey(today, -60) && !upcoming.has(r.contact_id) && contacts.has(r.contact_id)) followUps.push(r);
  }
  followUps.sort((a, b) => a.next_on!.localeCompare(b.next_on!));

  /* Consentements manquants */
  const signed = new Set(consents.map((c) => `${c.contact_id}:${c.template}`));
  const missingMap = new Map<string, { contact_id: string; templates: Set<ConsentTemplate>; last: string; entity_id: EntityId }>();
  for (const r of records) {
    const t = consentFor(r.kind);
    if (!t || signed.has(`${r.contact_id}:${t}`) || !contacts.has(r.contact_id)) continue;
    const m = missingMap.get(r.contact_id) ?? { contact_id: r.contact_id, templates: new Set<ConsentTemplate>(), last: r.performed_at, entity_id: r.entity_id };
    m.templates.add(t);
    missingMap.set(r.contact_id, m);
  }
  const missing = [...missingMap.values()].sort((a, b) => b.last.localeCompare(a.last));

  /* RDV terminés sans fiche technique (14 derniers jours) */
  const recorded = new Set(records.map((r) => r.appointment_id).filter(Boolean));
  const toFill = appts
    .filter((a) => a.status === "termine" && a.starts_at < nowIso && !recorded.has(a.id) && needsRecord(a.service) && contacts.has(a.contact_id))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const late = followUps.filter((r) => r.next_on! < today).length;

  /* Recherche (client, téléphone, prestation) + filtres */
  const q = (sp.q ?? "").trim();
  const etab = ids.includes(sp.etab as EntityId) ? (sp.etab as EntityId) : null;
  const delai = sp.delai === "retard" || sp.delai === "semaine" ? sp.delai : null;
  const byName = sp.tri === "client";
  const who = (id: string) => contacts.get(id);
  const hit = (contactId: string, entityId: EntityId, ...more: (string | null | undefined)[]) =>
    (!etab || entityId === etab) && matchesQuery(q, who(contactId)?.full_name, who(contactId)?.phone, ...more);
  const followView = sortRows(
    followUps.filter((r) => hit(r.contact_id, r.entity_id, r.service, r.zone) && (!delai || (delai === "retard" ? r.next_on! < today : r.next_on! >= today))),
    (r) => (byName ? who(r.contact_id)?.full_name : r.next_on),
    "asc",
  );
  const missingView = sortRows(
    missing.filter((m) => hit(m.contact_id, m.entity_id, ...[...m.templates].map((t) => CONSENT_LABEL[t]))),
    (m) => (byName ? who(m.contact_id)?.full_name : m.last),
    byName ? "asc" : "desc",
  );
  const fillView = sortRows(
    toFill.filter((a) => hit(a.contact_id, a.entity_id, a.service)),
    (a) => (byName ? who(a.contact_id)?.full_name : a.starts_at),
    byName ? "asc" : "desc",
  );
  const totals = { suivis: followUps.length, consentements: missing.length, fiches: toFill.length };
  const shown = { suivis: followView.length, consentements: missingView.length, fiches: fillView.length };
  const isFiltered = hasFilters(sp, ["q", "etab", "delai"]);
  const careEntities = scope.allowed.filter((e) => ids.includes(e.id));
  const noResults = isFiltered && totals[view] > 0 && shown[view] === 0;
  const clear = clearHref("/dossiers", sp, ["q", "etab", "delai", "tri"]);

  const row = (c: Contact | undefined, main: React.ReactNode, sub: React.ReactNode, right: React.ReactNode, key: string) =>
    c ? (
      <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{main}</p>
          <p className="truncate text-xs text-muted">{sub}</p>
        </div>
        <div className="flex items-center gap-1.5">{right}</div>
      </li>
    ) : null;

  return (
    <div>
      <PageHeader title="Dossiers de soins" subtitle="Ce qu'il reste à faire : relances de séances, consentements et fiches techniques" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 [&>*]:min-w-0">
        <SolidTile label="Séances à reprogrammer" value={followUps.length} sub={late ? `${late} en retard` : "Dans les 7 jours"} icon={<CalendarClock />} href="/dossiers" />
        <SolidTile label="Consentements à signer" value={missing.length} sub="Clients concernés" icon={<FileSignature />} href="/dossiers?v=consentements" />
        <SolidTile label="Fiches à compléter" value={toFill.length} sub="RDV des 14 derniers jours" icon={<ClipboardList />} href="/dossiers?v=fiches" />
      </div>

      <div className="mb-3">
        <Segmented
          active={view}
          items={[
            { id: "suivis", href: "/dossiers", label: "Séances à reprogrammer", count: followUps.length },
            { id: "consentements", href: "/dossiers?v=consentements", label: "Consentements", count: missing.length },
            { id: "fiches", href: "/dossiers?v=fiches", label: "Fiches à compléter", count: toFill.length },
          ]}
        />
      </div>

      <ListToolbar
        placeholder="Client, téléphone, prestation…"
        filters={[
          ...entityFilter(careEntities.map((e) => ({ id: e.id, short: e.short }))),
          ...(view === "suivis"
            ? [{ param: "delai", label: "Toutes", options: [{ value: "retard", label: "En retard", count: late }, { value: "semaine", label: "Cette semaine", count: followUps.length - late }] }]
            : []),
          { param: "tri", label: view === "suivis" ? "Par échéance" : "Plus récents", options: [{ value: "client", label: "Par client" }] },
        ]}
        right={<ResultCount shown={shown[view]} total={totals[view]} filtered={isFiltered} />}
      />

      <Card>
        {noResults && <NoResults q={q} href={clear} />}
        {view === "suivis" &&
          !noResults &&
          (followView.length ? (
            <ul className="divide-y divide-line">
              {followView.map((r) => {
                const c = contacts.get(r.contact_id);
                const d = daysUntil(r.next_on!);
                const wa = c ? waLink(c.phone, `Bonjour ${c.full_name.split(" ")[0]}, il est temps de programmer votre prochaine séance (${r.service}). Quel créneau vous conviendrait ?`) : null;
                return row(
                  c,
                  c && <ContactLink id={c.id} name={c.full_name} />,
                  <>
                    {r.service}
                    {r.zone && ` · ${r.zone}`} · dernière séance le {fmtDate(r.performed_at, { day: "numeric", month: "short" })}
                  </>,
                  <>
                    <span className={cn("mr-1 text-xs font-medium tabular-nums", d < 0 ? "text-red-600" : d === 0 ? "text-accent-600" : "text-muted")}>
                      {d < 0 ? `En retard de ${-d} j` : d === 0 ? "Aujourd'hui" : `Dans ${d} j`}
                    </span>
                    <EntityBadge id={r.entity_id} className="hidden sm:inline-flex" />
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "h-8 px-2")} title="Relancer sur WhatsApp">
                        <WhatsAppIcon className="size-4 text-emerald-600" />
                      </a>
                    )}
                    <Link href={`/agenda/nouveau?contact=${r.contact_id}`} className={buttonClass("secondary", "h-8")}>
                      <CalendarPlus /> RDV
                    </Link>
                  </>,
                  r.id,
                );
              })}
            </ul>
          ) : (
            <Empty icon={<CalendarClock />} title="Aucune séance à reprogrammer" text="Les séances dont la date conseillée approche apparaîtront ici." />
          ))}

        {view === "consentements" &&
          !noResults &&
          (missingView.length ? (
            <ul className="divide-y divide-line">
              {missingView.map((m) => {
                const c = contacts.get(m.contact_id);
                return row(
                  c,
                  c && <ContactLink id={c.id} name={c.full_name} />,
                  `Dernière séance le ${fmtDate(m.last, { day: "numeric", month: "short" })}`,
                  <>
                    {[...m.templates].map((t) => (
                      <Badge key={t} tone="red">
                        {CONSENT_LABEL[t]}
                      </Badge>
                    ))}
                    <Link href={`/contacts/${m.contact_id}?tab=dossier`} className={buttonClass("secondary", "h-8")}>
                      <FileSignature /> Faire signer
                    </Link>
                  </>,
                  m.contact_id,
                );
              })}
            </ul>
          ) : (
            <Empty icon={<FileSignature />} title="Tous les consentements sont signés" />
          ))}

        {view === "fiches" &&
          !noResults &&
          (fillView.length ? (
            <ul className="divide-y divide-line">
              {fillView.map((a) => {
                const c = contacts.get(a.contact_id);
                return row(
                  c,
                  c && <ContactLink id={c.id} name={c.full_name} />,
                  `${a.service} · ${fmtDate(a.starts_at, { weekday: "short", day: "numeric", month: "short" })}`,
                  <>
                    <EntityBadge id={a.entity_id} className="hidden sm:inline-flex" />
                    <Link href={`/contacts/${a.contact_id}?tab=dossier`} className={buttonClass("secondary", "h-8")}>
                      <ClipboardList /> Remplir
                    </Link>
                  </>,
                  a.id,
                );
              })}
            </ul>
          ) : (
            <Empty icon={<ClipboardList />} title="Toutes les fiches sont à jour" />
          ))}
      </Card>
    </div>
  );
}
