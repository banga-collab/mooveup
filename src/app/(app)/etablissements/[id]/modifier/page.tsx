import { notFound } from "next/navigation";
import { requireDirection } from "@/lib/auth";
import { loadEstablishments } from "@/lib/establishments";
import { saveEstablishment } from "@/actions/establishments";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { EstablishmentForm } from "../../establishment-form";

export const metadata = { title: "Modifier l'établissement" };

export default async function EditEstablishmentPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requireDirection()]);
  const e = (await loadEstablishments()).find((x) => x.id === id);
  if (!e) notFound();
  return (
    <div className="space-y-5">
      <PageHeader back={<BackLink href={`/etablissements/${e.id}`} label={e.short} />} title={`Modifier ${e.short}`} subtitle={`Identifiant : ${e.id}`} />
      <EstablishmentForm action={saveEstablishment.bind(null, e.id)} initial={e} cancelHref={`/etablissements/${e.id}`} />
    </div>
  );
}
