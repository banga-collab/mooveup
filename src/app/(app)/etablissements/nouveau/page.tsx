import { requireDirection } from "@/lib/auth";
import { saveEstablishment } from "@/actions/establishments";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { EstablishmentForm } from "../establishment-form";

export const metadata = { title: "Ajouter un établissement" };

export default async function NewEstablishmentPage() {
  await requireDirection();
  return (
    <div className="space-y-5">
      <PageHeader back={<BackLink href="/etablissements" label="Établissements" />} title="Ajouter un établissement" subtitle="Nom, type, couleur et icône : il sera disponible partout dans le CRM" />
      <EstablishmentForm action={saveEstablishment.bind(null, null)} initial={null} cancelHref="/etablissements" />
    </div>
  );
}
