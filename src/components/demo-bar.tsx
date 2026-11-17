import { Sparkles } from "lucide-react";
import { DEMO } from "@/lib/demo";

/** Repère visuel : les données sont fictives. */
export function DemoBar() {
  if (!DEMO) return null;
  return (
    <div className="no-print pointer-events-none fixed bottom-[76px] right-3 z-30 flex items-center gap-1.5 rounded-full bg-ink/85 px-3 py-1.5 text-[11px] font-semibold text-white shadow-pop backdrop-blur lg:bottom-4 lg:right-4">
      <Sparkles className="size-3.5 text-accent-400" />
      <span className="hidden sm:inline">Mode démo · données fictives</span>
      <span className="sm:hidden">Démo</span>
    </div>
  );
}
