import { redirect } from "next/navigation";
import { getScope, requireManager } from "@/lib/auth";
import { getTeam } from "@/lib/data";
import { saveGroup } from "@/actions/kids";
import { GroupForm } from "@/components/kids/group-form";
import { BackLink } from "@/components/back-link";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Nouveau groupe Kids" };

export default async function NewKidsGroupPage() {
  await requireManager();
  const scope = await getScope();
  if (!scope.allowed.some((e) => e.id === "kids")) redirect("/kids");
  const team = await getTeam(scope);
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/kids?v=groupes" label="Groupes Kids" />
      <PageHeader title="Nouveau groupe" subtitle="Activité, tranche d'âge, horaires et capacité" />
      <Card className="p-5">
        <GroupForm action={saveGroup.bind(null, null)} coaches={team.map((p) => ({ id: p.id, full_name: p.full_name }))} submit="Créer le groupe" />
      </Card>
    </div>
  );
}
