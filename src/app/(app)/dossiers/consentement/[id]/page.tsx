import { notFound } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { entity, type EntityId } from "@/lib/entities";
import type { Contact, Profile } from "@/lib/types";
import { fmtDate, fmtTime } from "@/lib/utils";
import { CARE_ENTITIES, canSeeMedical, type Consent } from "@/lib/types-care";
import { BackLink } from "@/components/back-link";
import { PrintButton } from "@/components/care/print-button";

export const metadata = { title: "Consentement" };

export default async function ConsentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, me, scope] = await Promise.all([params, getProfile(), getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("consents").select("*").eq("id", id).maybeSingle();
  const consent = data as Consent | null;
  const allowed = scope.allowed.map((e) => e.id);
  const base: EntityId[] = canSeeMedical(me) ? CARE_ENTITIES : ["evolve"];
  const careIds = base.filter((e) => allowed.includes(e));
  if (!consent || !careIds.includes(consent.entity_id)) notFound();

  const [{ data: c }, { data: p }] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", consent.contact_id).maybeSingle(),
    consent.collected_by ? supabase.from("profiles").select("*").eq("id", consent.collected_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const contact = c as Contact | null;
  const collector = p as Profile | null;
  const e = entity(consent.entity_id);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <BackLink href={`/contacts/${consent.contact_id}?tab=dossier`} label={contact?.full_name ?? "Fiche client"} />
        <PrintButton />
      </div>
      <article className="rounded-xl border border-line bg-white px-6 py-8 text-ink sm:px-10 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="text-[13px] font-semibold" style={{ color: e?.color }}>
              {e?.name}
            </p>
            <p className="text-xs text-muted">Groupe Moov&apos;Up · Agadir</p>
          </div>
          <p className="text-right text-xs text-muted">
            Document n° {consent.id.slice(-8).toUpperCase()}
            <br />
            {fmtDate(consent.signed_at)}
          </p>
        </header>

        <h1 className="mt-6 text-lg font-semibold">{consent.title}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
          <dt className="text-muted">Client</dt>
          <dd className="font-medium">{contact?.full_name ?? "—"}</dd>
          {contact?.birth_date && (
            <>
              <dt className="text-muted">Date de naissance</dt>
              <dd>{fmtDate(contact.birth_date)}</dd>
            </>
          )}
          {contact?.phone && (
            <>
              <dt className="text-muted">Téléphone</dt>
              <dd className="tabular-nums">{contact.phone}</dd>
            </>
          )}
        </dl>

        <div className="mt-6 space-y-3 text-sm leading-relaxed text-slate-700">
          {consent.body.split("\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted">Signature du client</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={consent.signature} alt="Signature" className="mt-2 h-24 w-full max-w-[260px] border-b border-line object-contain object-left" />
            <p className="mt-2 text-[13px]">
              {consent.signed_by}, le {fmtDate(consent.signed_at, { day: "numeric", month: "long", year: "numeric" })} à {fmtTime(consent.signed_at)}
            </p>
          </div>
          {collector && (
            <div>
              <p className="text-xs text-muted">Recueilli par</p>
              <p className="mt-2 text-[13px] font-medium">{collector.full_name}</p>
              {collector.job_title && <p className="text-[13px] text-muted">{collector.job_title}</p>}
            </div>
          )}
        </div>
        <p className="mt-10 text-[11px] text-muted">Document conservé dans le dossier client, accessible uniquement à l&apos;équipe de soins et à la direction.</p>
      </article>
    </div>
  );
}
