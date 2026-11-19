import { notFound } from "next/navigation";
import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Partnership } from "@/lib/types-business";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { PartnershipForm } from "@/components/collaborations/partnership-form";

export const metadata = { title: "Modifier la collaboration" };

export default async function ModifierCollaborationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("partnerships").select("*").eq("id", id).maybeSingle();
  const p = data as Partnership | null;
  if (!p || ((p.entity_ids ?? []).length && !p.entity_ids.some((e) => scope.allowed.some((a) => a.id === e)))) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<BackLink href={`/collaborations/${id}`} label={p.title} />} title="Modifier la collaboration" />
      <PartnershipForm p={p} entities={scope.allowed} />
    </div>
  );
}
