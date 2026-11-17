import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getContacts } from "@/lib/data";
import { dayKey } from "@/lib/utils";
import type { CatalogItem, Contact } from "@/lib/types";
import { createSubscription } from "@/actions/subscriptions";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { SubscriptionForm, type Plan } from "@/components/subscriptions/subscription-form";

export const metadata = { title: "Nouvel abonnement" };

export default async function NewSubscriptionPage({ searchParams }: { searchParams: Promise<{ contact?: string; formule?: string }> }) {
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();
  const allowedIds = scope.allowed.map((e) => e.id);

  const [contacts, { data: itemRows }] = await Promise.all([
    getContacts({ ...scope, current: null, ids: allowedIds }),
    supabase.from("catalog_items").select("*").in("entity_id", allowedIds).in("kind", ["abonnement", "pack"]).eq("active", true).order("price_mad"),
  ]);
  let list = contacts;
  let preset: Contact | null = null;
  if (sp.contact) {
    preset = contacts.find((c) => c.id === sp.contact) ?? null;
    if (!preset) {
      const { data } = await supabase.from("contacts").select("*").eq("id", sp.contact).maybeSingle();
      preset = (data as Contact | null) ?? null;
      if (preset) list = [preset, ...contacts];
    }
  }

  const plans: Plan[] = ((itemRows ?? []) as CatalogItem[]).map((i) => ({
    id: i.id,
    entity_id: i.entity_id,
    kind: i.kind as Plan["kind"],
    name: i.name,
    category: i.category,
    price_mad: Number(i.price_mad),
    duration_days: i.duration_days,
    sessions_count: i.sessions_count,
  }));
  // Établissement par défaut : celui du sélecteur, sinon le premier du client qui propose des formules
  const withPlans = scope.allowed.filter((e) => plans.some((p) => p.entity_id === e.id));
  const presetPlan = sp.formule ? plans.find((p) => p.id === sp.formule) ?? null : null;
  const entityId =
    presetPlan?.entity_id ?? scope.current?.id ?? preset?.entity_ids.find((e) => withPlans.some((w) => w.id === e)) ?? withPlans[0]?.id ?? scope.allowed[0]?.id ?? null;
  const back = sp.contact ? `/contacts/${sp.contact}` : "/abonnements";

  return (
    <div>
      <PageHeader title="Nouvel abonnement" subtitle="Abonnement ou pack de séances, avec encaissement" back={<BackLink href={back} label={sp.contact ? "Retour à la fiche" : "Retour aux abonnements"} />} />
      <SubscriptionForm
        action={createSubscription}
        contacts={list.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone }))}
        entities={scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color }))}
        plans={plans}
        defaultContactId={preset?.id ?? null}
        defaultEntityId={entityId}
        defaultPlanId={presetPlan?.id ?? null}
        today={dayKey()}
        cancelHref={back}
      />
    </div>
  );
}
