import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getContacts } from "@/lib/data";
import type { Campaign } from "@/lib/types";
import { dayKey } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { CampaignBuilder, type BuilderInitial } from "@/components/campaigns/builder";
import { parseSegment } from "@/components/campaigns/shared";

export const metadata = { title: "Nouvelle campagne" };

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ depuis?: string }> }) {
  const [{ depuis }, me, scope] = await Promise.all([searchParams, getProfile(), getScope()]);
  if (me.role === "staff") redirect("/");
  const allowed = scope.allowed.map((e) => e.id as string);

  // Duplication d'une campagne existante
  let initial: BuilderInitial | undefined;
  if (depuis) {
    const supabase = await createClient();
    const { data } = await supabase.from("campaigns").select("*").eq("id", depuis).maybeSingle();
    const src = data as Campaign | null;
    if (src) {
      const segment = parseSegment(src.segment);
      segment.entity_ids = segment.entity_ids.filter((e) => allowed.includes(e));
      initial = { name: `${src.name} (copie)`, channel: src.channel, message: src.message, segment };
    }
  }

  const contacts = await getContacts(scope);
  const tags = [...new Set(contacts.flatMap((c) => c.tags ?? []))].sort((a, b) => a.localeCompare(b, "fr"));

  return (
    <>
      <PageHeader
        back={<BackLink href="/campagnes" label="Campagnes" />}
        title={initial ? "Dupliquer une campagne" : "Nouvelle campagne"}
        subtitle="Choisissez qui reçoit le message, écrivez-le, puis envoyez ou programmez"
      />
      <CampaignBuilder
        entities={scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color, soft: e.soft }))}
        defaultEntityIds={scope.ids}
        tags={tags}
        initial={initial}
        today={dayKey()}
      />
    </>
  );
}
