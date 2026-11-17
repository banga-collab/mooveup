import { notFound } from "next/navigation";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureCard, qrSvg } from "@/lib/access";
import type { Contact } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { MemberCardView } from "@/components/access/member-card";
import { PrintButton } from "@/components/access/print-button";

export const metadata = { title: "Carte d'accès" };

export default async function PrintCardPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  const contact = data as Contact | null;
  const allowed = scope.allowed.map((e) => e.id);
  if (!contact || (contact.entity_ids.length && !contact.entity_ids.some((e) => allowed.includes(e)))) notFound();
  const card = await ensureCard(supabase, contact.id);
  if (!card) notFound();
  const svg = await qrSvg(card.code);

  return (
    <div>
      <div className="no-print">
        <PageHeader
          back={<BackLink href={`/contacts/${contact.id}?tab=carte`} label={contact.full_name} />}
          title="Carte d'accès"
          subtitle="Format carte bancaire (85,6 × 54 mm). Imprimez sur papier épais ou plastifiez."
          actions={<PrintButton label="Imprimer la carte" />}
        />
      </div>
      <div className="flex justify-center py-6 print:justify-start print:py-0">
        <MemberCardView name={contact.full_name} code={card.code} svg={svg} entityIds={contact.entity_ids} />
      </div>
    </div>
  );
}
