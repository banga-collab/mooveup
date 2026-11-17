import { notFound } from "next/navigation";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";
import { updateContact } from "@/actions/contacts";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contacts/contact-form";

export const metadata = { title: "Modifier le contact" };

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getScope();
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  const contact = data as Contact | null;
  if (!contact || !contact.entity_ids.some((e) => scope.allowed.some((a) => a.id === e))) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<BackLink href={`/contacts/${id}`} label={contact.full_name} />} title="Modifier le contact" subtitle={contact.full_name} />
      <ContactForm action={updateContact.bind(null, id)} contact={contact} entities={scope.allowed} defaultEntities={contact.entity_ids} cancelHref={`/contacts/${id}`} />
    </div>
  );
}
