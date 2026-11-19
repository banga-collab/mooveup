import { requireManager, getScope } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { SupplierForm } from "@/components/finance/supplier-form";

export const metadata = { title: "Nouveau fournisseur" };

export default async function NouveauFournisseurPage() {
  await requireManager();
  const scope = await getScope();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<BackLink href="/fournisseurs" label="Fournisseurs" />} title="Nouveau fournisseur" subtitle="Seul le nom est obligatoire ; complétez le reste quand vous l'avez." />
      <SupplierForm supplier={null} entities={scope.allowed} />
    </div>
  );
}
