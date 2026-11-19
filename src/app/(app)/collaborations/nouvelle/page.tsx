import { requireManager, getScope } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { PartnershipForm } from "@/components/collaborations/partnership-form";

export const metadata = { title: "Nouvelle collaboration" };

export default async function NouvelleCollaborationPage() {
  await requireManager();
  const scope = await getScope();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<BackLink href="/collaborations" label="Collaborations" />} title="Nouvelle collaboration" subtitle="Le partenaire et la nature suffisent pour commencer." />
      <PartnershipForm p={null} entities={scope.allowed} defaultEntity={scope.current?.id ?? null} />
    </div>
  );
}
