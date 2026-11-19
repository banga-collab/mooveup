import Link from "next/link";
import { ExternalLink, MapPin, Plus, Printer, Sparkles } from "lucide-react";
import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { qrSvg, siteOrigin } from "@/lib/access";
import { DEFAULT_ZONES, type Complaint, type ComplaintZone } from "@/lib/types-business";
import { addDefaultZones, addZone, removeZone } from "@/actions/complaints";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardHeader, Input, PageHeader, Segmented, buttonClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { PrintButton, DeleteIconButton } from "@/components/finance/controls";
import { QrPoster } from "@/components/complaints/qr-poster";

export const metadata = { title: "QR codes de signalement" };

export default async function QrPage({ searchParams }: { searchParams: Promise<{ e?: string; seule?: string }> }) {
  await requireManager();
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const ent = scope.allowed.find((e) => e.id === sp.e) ?? scope.current ?? scope.allowed[0]!;
  const supabase = await createClient();
  const [{ data: zRows }, { data: cRows }, origin] = await Promise.all([
    supabase.from("complaint_zones").select("*").eq("entity_id", ent.id).order("created_at"),
    supabase.from("complaints").select("*").eq("entity_id", ent.id).gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString()),
    siteOrigin(),
  ]);
  const zones = (zRows ?? []) as ComplaintZone[];
  const perZone = new Map<string, number>();
  for (const c of (cRows ?? []) as Complaint[]) perZone.set(c.zone_id ?? "general", (perZone.get(c.zone_id ?? "general") ?? 0) + 1);

  const all = [{ id: "general", label: null as string | null }, ...zones.map((z) => ({ id: z.id, label: z.label as string | null }))];
  const shown = sp.seule ? all.filter((p) => p.id === sp.seule) : all;
  const posters = await Promise.all(
    shown.map(async (p) => {
      const url = `${origin}/signaler?e=${ent.id}${p.id === "general" ? "" : `&z=${p.id}`}`;
      return { ...p, url, svg: await qrSvg(url) };
    }),
  );
  const missingDefaults = DEFAULT_ZONES[ent.kind].some((l) => !zones.some((z) => z.label.toLowerCase() === l.toLowerCase()));

  return (
    <div className="space-y-5">
      <style>{`@media print { @page { size: A5 portrait; margin: 8mm; } .qr-sheet { display: block !important; } .qr-sheet > * { max-width: 132mm; margin: 0 auto; break-after: page; } .qr-poster { border: none !important; border-radius: 0 !important; background: #fff !important; color: #111827 !important; } }`}</style>
      <div className="no-print space-y-5">
        <PageHeader
          back={<BackLink href="/reclamations" label="Réclamations" />}
          title="QR codes de signalement"
          subtitle="Affiches A5 à imprimer et à poser dans chaque zone : le client scanne et signale le problème depuis son téléphone."
          actions={<PrintButton label={sp.seule ? "Imprimer l'affiche" : `Imprimer ${posters.length} affiche${posters.length > 1 ? "s" : ""}`} />}
        />
        {scope.allowed.length > 1 && <Segmented items={scope.allowed.map((e) => ({ id: e.id, label: e.short, href: `/reclamations/qr?e=${e.id}` }))} active={ent.id} />}

        <Card>
          <CardHeader title="Zones" subtitle="Une affiche par zone permet de savoir où se trouve le problème" icon={<MapPin />} />
          <ul className="flex flex-wrap gap-2 px-5">
            <li>
              <Link href={`/reclamations/qr?e=${ent.id}&seule=general`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-slate-700 hover:border-slate-300">
                Affiche générale <span className="text-xs tabular-nums text-muted">{perZone.get("general") ?? 0}</span>
              </Link>
            </li>
            {zones.map((z) => (
              <li key={z.id} className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-line pl-3 text-[13px] text-slate-700">
                <Link href={`/reclamations/qr?e=${ent.id}&seule=${z.id}`} className="hover:text-ink hover:underline">
                  {z.label}
                </Link>
                <span className="ml-1 text-xs tabular-nums text-muted" title="Signalements sur 90 jours">
                  {perZone.get(z.id) ?? 0}
                </span>
                <form action={removeZone.bind(null, z.id)}>
                  <DeleteIconButton label={`Supprimer la zone ${z.label}`} message={`Supprimer la zone « ${z.label} » ? Son QR code ne fonctionnera plus (les signalements passés sont conservés).`} />
                </form>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-start gap-2 px-5 pb-5 pt-4">
            <ActionForm action={addZone} className="flex min-w-0 flex-1 gap-2">
              <input type="hidden" name="entity_id" value={ent.id} />
              <Input name="label" placeholder="Nouvelle zone : Piscine, Tapis n° 3…" required className="min-w-0 flex-1 sm:max-w-xs" />
              <SubmitButton variant="secondary" pendingText="Ajout…">
                <Plus className="size-4" /> Ajouter
              </SubmitButton>
            </ActionForm>
            {missingDefaults && (
              <form action={addDefaultZones.bind(null, ent.id)}>
                <button type="submit" className={buttonClass("ghost")}>
                  <Sparkles /> Zones proposées
                </button>
              </form>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
          <span>
            {sp.seule ? (
              <Link href={`/reclamations/qr?e=${ent.id}`} className="font-medium text-brand-600 hover:underline">
                ← Toutes les affiches de {ent.short}
              </Link>
            ) : (
              `${posters.length} affiche${posters.length > 1 ? "s" : ""} pour ${ent.short} · cliquez sur une zone pour n'imprimer que celle-ci`
            )}
          </span>
          {posters[0] && (
            <a href={posters[0].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
              Tester le formulaire <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="qr-sheet grid gap-5 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        {posters.map((p) => (
          <div key={p.id}>
            <QrPoster ent={ent} zone={p.label} svg={p.svg} url={p.url} />
          </div>
        ))}
      </div>
      <p className="no-print flex items-center gap-1.5 text-xs text-muted">
        <Printer className="size-3.5" /> Format A5 portrait · papier 160 g ou plastifié conseillé pour les vestiaires et la piscine.
      </p>
    </div>
  );
}
