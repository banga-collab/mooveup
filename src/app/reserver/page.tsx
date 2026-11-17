import { publicDb, BOOKABLE, cmiConfigured } from "@/lib/access";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import { dayKey } from "@/lib/utils";
import type { CatalogItem } from "@/lib/types";
import { BookingWizard, type BookItem } from "@/components/booking/wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Réserver en ligne · Moov'Up Agadir" } };

export default async function ReservePage({ searchParams }: { searchParams: Promise<{ e?: string; p?: string }> }) {
  const sp = await searchParams;
  const db = publicDb();
  const [{ data: itemRows }, { data: settingsRow }] = await Promise.all([
    db.from("catalog_items").select("*").in("entity_id", BOOKABLE).eq("kind", "prestation").eq("active", true).order("price_mad"),
    db.from("settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...((settingsRow as Partial<Settings> | null) ?? {}) };
  const items: BookItem[] = ((itemRows ?? []) as CatalogItem[]).map((i) => ({
    id: i.id,
    entity_id: i.entity_id,
    name: i.name,
    category: i.category,
    price_mad: i.price_mad,
    duration_min: i.duration_min ?? 60,
  }));
  const entities = BOOKABLE.filter((e) => items.some((i) => i.entity_id === e));
  const deposit = settings.cmi_enabled && settings.booking_deposit_mad > 0 ? settings.booking_deposit_mad : 0;

  return (
    <BookingWizard
      entities={entities}
      items={items}
      today={dayKey()}
      initialEntity={entities.includes(sp.e as never) ? sp.e! : null}
      initialItem={items.some((i) => i.id === sp.p) ? sp.p! : null}
      deposit={deposit}
      depositOnline={deposit > 0 && cmiConfigured(settings.cmi_client_id)}
      phone={settings.phone}
    />
  );
}
