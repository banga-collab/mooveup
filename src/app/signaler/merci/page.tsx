import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { entity } from "@/lib/entities";

export const metadata = { title: "Merci" };

export default async function MerciPage({ searchParams }: { searchParams: Promise<{ ref?: string; e?: string }> }) {
  const sp = await searchParams;
  const ent = entity(sp.e);
  const ref = sp.ref && /^R-[A-Z0-9]{5}$/.test(sp.ref) ? sp.ref : null;
  return (
    <div className="rounded-xl border border-line bg-white px-6 py-10 text-center">
      <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
      <h1 className="mt-4 text-xl font-semibold text-ink">Merci, c&apos;est transmis !</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
        {ent ? `L'équipe de ${ent.short} a été prévenue` : "L'équipe a été prévenue"} et va s&apos;en occuper au plus vite.
      </p>
      {ref && (
        <p className="mt-4 text-[13px] text-muted">
          Référence : <span className="font-semibold tabular-nums text-ink">{ref}</span>
        </p>
      )}
      {ent && (
        <Link href={`/signaler?e=${ent.id}`} className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline">
          Signaler autre chose
        </Link>
      )}
    </div>
  );
}
