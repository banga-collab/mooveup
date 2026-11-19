import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { ENTITIES, entity } from "@/lib/entities";
import { publicDb } from "@/lib/access";
import type { ComplaintZone } from "@/lib/types-business";
import { EntityMark } from "@/components/entity-icon";
import { ReportForm } from "@/components/complaints/report-form";

export const metadata = { title: "Signaler un problème" };

export default async function SignalerPage({ searchParams }: { searchParams: Promise<{ e?: string; z?: string }> }) {
  const sp = await searchParams;
  const ent = entity(sp.e);

  if (!ent) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-ink">Signaler un problème</h1>
        <p className="mt-1 text-sm text-muted">Dans quel établissement êtes-vous ?</p>
        <ul className="mt-5 space-y-2">
          {ENTITIES.map((e) => (
            <li key={e.id}>
              <Link href={`/signaler?e=${e.id}`} className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 hover:border-slate-300">
                <EntityMark id={e.id} size={32} />
                <span className="flex-1 text-[15px] font-medium text-ink">{e.short}</span>
                <ChevronRight className="size-4 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  let zone: ComplaintZone | null = null;
  if (sp.z && /^[0-9a-f-]{36}$/i.test(sp.z)) {
    const { data } = await publicDb().from("complaint_zones").select("*").eq("id", sp.z).maybeSingle();
    zone = (data as ComplaintZone | null)?.entity_id === ent.id ? (data as ComplaintZone) : null;
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <EntityMark id={ent.id} size={40} />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight text-ink">Signaler un problème</h1>
          <p className="flex items-center gap-1 truncate text-[13px] text-muted">
            {ent.short}
            {zone && (
              <>
                <span>·</span>
                <MapPin className="size-3.5" /> {zone.label}
              </>
            )}
          </p>
        </div>
      </div>
      <p className="mb-6 mt-4 text-sm text-slate-600">Une panne, un souci de propreté ou de sécurité ? Dites-le-nous : l&apos;équipe est prévenue immédiatement.</p>
      <ReportForm entityId={ent.id} zoneId={zone?.id ?? null} />
    </div>
  );
}
