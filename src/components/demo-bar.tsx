import { DEMO } from "@/lib/demo";

/** Repère visuel discret : les données sont fictives. */
export function DemoBar() {
  if (!DEMO) return null;
  return (
    <div
      role="status"
      className="no-print pointer-events-none fixed bottom-[76px] right-3 z-30 flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 lg:bottom-4 lg:right-4"
    >
      <span className="size-1.5 rounded-full bg-accent-500" aria-hidden />
      <span className="hidden sm:inline">Mode démo · données fictives</span>
      <span className="sm:hidden">Démo</span>
    </div>
  );
}
