import { getScope, requireManager } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Importer } from "@/components/import/importer";

export const metadata = { title: "Importer des clients" };

export default async function ImportPage() {
  await requireManager();
  const scope = await getScope();
  const entities = scope.allowed.map((e) => ({ id: e.id, name: e.short }));
  const defaults = scope.current ? [scope.current.id] : scope.allowed.length === 1 ? [scope.allowed[0]!.id] : [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Importer des clients" subtitle="Reprenez votre fichier Excel de clients existants : colonnes reconnues, doublons détectés par téléphone." />
      <Importer entities={entities} defaultEntities={defaults} />
    </div>
  );
}
