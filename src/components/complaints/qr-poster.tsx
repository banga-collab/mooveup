import type { Entity } from "@/lib/entities";

/**
 * Affiche A5 « Signaler un problème » avec le QR code.
 * Tailles en unités de conteneur (cqw) : même rendu à l'écran (aperçu) et à l'impression (A5).
 */
export function QrPoster({ ent, zone, svg, url }: { ent: Entity; zone: string | null; svg: string; url: string }) {
  return (
    <div className="qr-poster @container print-break relative mx-auto flex aspect-[148/210] w-full flex-col overflow-hidden rounded-xl border border-line bg-white text-ink">
      <div className="h-[2.2cqw] w-full" style={{ background: ent.color }} />
      <div className="flex flex-1 flex-col items-center px-[8cqw] pb-[6cqw] pt-[6cqw] text-center">
        <div className="flex w-full items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Moov'Up" className="h-auto w-[30cqw]" />
          <span className="inline-flex items-center gap-[1.5cqw] text-[3.4cqw] font-medium text-slate-600">
            <span className="size-[2.4cqw] rounded-full" style={{ background: ent.color }} />
            {ent.short}
          </span>
        </div>

        <h2 className="mt-[8cqw] text-[8.5cqw] font-semibold leading-[1.05] tracking-tight">Un problème ?</h2>
        <p className="mt-[1.5cqw] text-[4.2cqw] text-slate-600">Signalez-le en 30 secondes, l&apos;équipe est prévenue tout de suite.</p>
        <p dir="rtl" lang="ar" className="mt-[1cqw] text-[3.8cqw] text-slate-500">
          هل لاحظتم مشكلة؟ أخبرونا في 30 ثانية
        </p>

        <div className="mt-[5cqw] w-[58cqw] rounded-[3cqw] border border-slate-200 p-[2.5cqw] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />

        {zone && <p className="mt-[3.5cqw] rounded-full bg-slate-100 px-[4cqw] py-[1.2cqw] text-[3.8cqw] font-medium">Zone : {zone}</p>}

        <ol className="mt-auto grid w-full grid-cols-3 gap-[3cqw] pt-[4cqw] text-left text-[3cqw] leading-snug text-slate-600">
          <li>
            <span className="block text-[4.5cqw] font-semibold text-ink">1</span>Scannez avec l&apos;appareil photo
          </li>
          <li>
            <span className="block text-[4.5cqw] font-semibold text-ink">2</span>Panne, propreté, sécurité…
          </li>
          <li>
            <span className="block text-[4.5cqw] font-semibold text-ink">3</span>Envoyez, photo facultative
          </li>
        </ol>
        <p className="mt-[3cqw] w-full truncate border-t border-slate-200 pt-[2.5cqw] text-[2.6cqw] text-slate-400">{url.replace(/^https?:\/\//, "")}</p>
      </div>
    </div>
  );
}
