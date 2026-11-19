import { notFound } from "next/navigation";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { loadTicket } from "@/components/sales/query";
import { Ticket, TicketPrintStyle } from "@/components/sales/ticket";
import { PrintButton } from "@/components/sales/ticket-actions";

export const metadata = { title: "Ticket de caisse" };

/** Ticket 80 mm d'une vente (réimpression) */
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("sales").select("entity_id").eq("id", id).maybeSingle();
  const entityId = (data as { entity_id: string } | null)?.entity_id;
  if (!entityId || !scope.allowed.some((e) => e.id === entityId)) notFound();
  const t = await loadTicket(id);
  if (!t) notFound();
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <TicketPrintStyle />
      <div className="no-print flex items-center justify-between gap-3">
        <BackLink href={`/ventes/${id}`} label={`Vente ${t.number}`} />
        <PrintButton />
      </div>
      <div className="rounded-xl border border-line bg-slate-50 py-4">
        <Ticket t={t} className="border border-line" />
      </div>
      <p className="no-print text-center text-xs text-muted">Format 80 mm · choisissez l&apos;imprimante de tickets dans la fenêtre d&apos;impression.</p>
    </div>
  );
}
