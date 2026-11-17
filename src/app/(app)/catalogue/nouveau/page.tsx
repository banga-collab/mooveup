import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CatalogItem, CatalogKind } from "@/lib/types";
import { saveCatalogItem } from "@/actions/catalog";
import { BackLink } from "@/components/back-link";
import { Card, PageHeader } from "@/components/ui";
import { CatalogForm } from "@/components/catalog/catalog-form";
import { KIND_ORDER } from "@/components/sales/meta";

export const metadata = { title: "Nouvel article" };

export default async function NewCatalogItemPage({ searchParams }: { searchParams: Promise<{ type?: string; etab?: string }> }) {
  const sp = await searchParams;
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role !== "direction" && me.role !== "manager") redirect("/catalogue");
  const supabase = await createClient();
  const { data } = await supabase.from("catalog_items").select("category").in("entity_id", scope.allowed.map((e) => e.id));
  const categories = [...new Set(((data ?? []) as Pick<CatalogItem, "category">[]).map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const defaultEntity = scope.allowed.find((e) => e.id === sp.etab)?.id ?? scope.current?.id ?? scope.allowed[0]!.id;
  const defaultKind = KIND_ORDER.includes(sp.type as CatalogKind) ? (sp.type as CatalogKind) : "prestation";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nouvel article" subtitle="Ajoutez une formule, une prestation ou un produit au catalogue" back={<BackLink href="/catalogue" label="Catalogue" />} />
      <Card>
        <div className="p-5">
          <CatalogForm
            action={saveCatalogItem.bind(null, null)}
            entities={scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color, soft: e.soft }))}
            defaultEntity={defaultEntity}
            defaultKind={defaultKind}
            categories={categories}
          />
        </div>
      </Card>
    </div>
  );
}
