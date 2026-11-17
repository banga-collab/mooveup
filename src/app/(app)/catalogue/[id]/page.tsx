import { notFound, redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CatalogItem } from "@/lib/types";
import { saveCatalogItem } from "@/actions/catalog";
import { BackLink } from "@/components/back-link";
import { Card, PageHeader } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { CatalogForm } from "@/components/catalog/catalog-form";

export const metadata = { title: "Modifier un article" };

export default async function EditCatalogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role !== "direction" && me.role !== "manager") redirect("/catalogue");
  const supabase = await createClient();
  const { data } = await supabase.from("catalog_items").select("*").eq("id", id).maybeSingle();
  const item = data as CatalogItem | null;
  if (!item || !scope.allowed.some((e) => e.id === item.entity_id)) notFound();
  const { data: cats } = await supabase.from("catalog_items").select("category").in("entity_id", scope.allowed.map((e) => e.id));
  const categories = [...new Set(((cats ?? []) as Pick<CatalogItem, "category">[]).map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={item.name} subtitle={<EntityBadge id={item.entity_id} />} back={<BackLink href="/catalogue" label="Catalogue" />} />
      <Card>
        <div className="p-5">
          <CatalogForm
            action={saveCatalogItem.bind(null, item.id)}
            entities={scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color, soft: e.soft }))}
            item={item}
            defaultEntity={item.entity_id}
            defaultKind={item.kind}
            categories={categories}
          />
        </div>
      </Card>
    </div>
  );
}
