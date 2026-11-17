import { getScope, requireManager } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { CompanyForm } from "@/components/corporate/company-form";
import { createCompany } from "@/actions/corporate";

export const metadata = { title: "Nouvelle entreprise partenaire" };

export default async function NewCompanyPage() {
  await requireManager();
  const scope = await getScope();
  const entities = scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<BackLink href="/entreprises" label="Entreprises partenaires" />} title="Nouvelle entreprise partenaire" subtitle="Les salariés se rattachent à l'étape suivante" />
      <Card className="p-5 sm:p-6">
        <CompanyForm action={createCompany} entities={entities} submitLabel="Créer l'entreprise" />
      </Card>
    </div>
  );
}
