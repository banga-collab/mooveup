import { getScope } from "@/lib/auth";
import { createContact } from "@/actions/contacts";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contacts/contact-form";

export const metadata = { title: "Nouveau contact" };

export default async function NewContactPage() {
  const scope = await getScope();
  const defaults = scope.current ? [scope.current.id] : scope.allowed.length === 1 ? [scope.allowed[0]!.id] : [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<BackLink href="/contacts" label="Clients & contacts" />} title="Nouveau contact" subtitle="Client, prospect ou ancien client : une seule fiche pour tout le groupe." />
      <ContactForm action={createContact} entities={scope.allowed} defaultEntities={defaults} cancelHref="/contacts" />
    </div>
  );
}
