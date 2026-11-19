import { notFound } from "next/navigation";
import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SupplierFull } from "@/lib/types-business";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { SupplierForm } from "@/components/finance/supplier-form";

export const metadata = { title: "Modifier le fournisseur" };

export default async function ModifierFournisseurPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  const s = data as SupplierFull | null;
  if (!s || ((s.entity_ids ?? []).length && !s.entity_ids.some((e) => scope.allowed.some((a) => a.id === e)))) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<BackLink href={`/fournisseurs/${id}`} label={s.name} />} title="Modifier la fiche" />
      <SupplierForm supplier={s} entities={scope.allowed} />
    </div>
  );
}
