import { getProfile, getScope } from "@/lib/auth";
import { getContacts, getTeam } from "@/lib/data";
import { addDaysKey, dayKey } from "@/lib/utils";
import { createLead } from "@/actions/leads";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { LeadForm } from "@/components/leads/lead-form";
import { param } from "@/components/contacts/helpers";

export const metadata = { title: "Nouveau prospect" };

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const [contacts, team] = await Promise.all([getContacts(scope), getTeam(scope)]);
  const wanted = param(sp.contact);
  const preset = wanted ? contacts.find((c) => c.id === wanted) : undefined;
  const allowedIds = scope.allowed.map((e) => e.id);
  const defaultEntity = scope.current?.id ?? preset?.entity_ids.find((e) => allowedIds.includes(e)) ?? scope.allowed[0]!.id;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={<BackLink href={preset ? `/contacts/${preset.id}?tab=prospects` : "/prospects"} label={preset ? preset.full_name : "Prospects"} />}
        title="Nouveau prospect"
        subtitle={preset ? `Opportunité pour ${preset.full_name}` : "Une personne intéressée par une offre ou une prestation."}
      />
      <LeadForm
        action={createLead}
        contacts={contacts.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone, source: c.source }))}
        entities={scope.allowed}
        team={team.map((p) => ({ id: p.id, full_name: p.full_name }))}
        defaultContact={preset?.id ?? null}
        defaultEntity={defaultEntity}
        defaultOwner={team.some((p) => p.id === me.id) ? me.id : ""}
        defaultDate={addDaysKey(dayKey(), 1)}
      />
    </div>
  );
}
