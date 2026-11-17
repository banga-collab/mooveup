import Image from "next/image";
import { entity } from "@/lib/entities";

/** Carte membre au format carte bancaire (85,6 × 54 mm) : logo, nom, QR code, code lisible */
export function MemberCardView({ name, code, svg, entityIds }: { name: string; code: string; svg: string; entityIds: string[] }) {
  const names = entityIds.map((e) => entity(e)?.short).filter(Boolean).join(" · ");
  return (
    <div className="flex aspect-[85.6/54] w-full max-w-[342px] overflow-hidden rounded-xl border border-line bg-white print:w-[85.6mm] print:max-w-none print:rounded-[3mm]">
      <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
        <Image src="/logo.png" alt="Moov'Up" width={473} height={136} className="h-auto w-24" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight text-ink">{name}</p>
          {names && <p className="mt-0.5 truncate text-[10.5px] text-muted">{names}</p>}
          <p className="mt-2 font-mono text-[12px] font-semibold tracking-wider text-ink">{code}</p>
        </div>
      </div>
      <div className="grid w-[44%] shrink-0 place-items-center border-l border-line p-2.5">
        <div className="w-full [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}
