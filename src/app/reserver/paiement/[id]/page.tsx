import { notFound, redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { cmiConfigured, cmiForm, publicDb, siteOrigin } from "@/lib/access";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import { mad } from "@/lib/utils";
import type { OnlineBooking } from "@/lib/types-access";
import { AutoSubmit } from "@/components/booking/auto-submit";

export const metadata = { title: "Paiement de l'acompte", robots: { index: false } };

/** Redirection vers la passerelle de paiement CMI pour l'acompte */
export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = publicDb();
  const [{ data }, { data: s }] = await Promise.all([db.from("online_bookings").select("*").eq("id", id).maybeSingle(), db.from("settings").select("*").eq("id", 1).maybeSingle()]);
  const b = data as OnlineBooking | null;
  if (!b) notFound();
  const settings: Settings = { ...DEFAULT_SETTINGS, ...((s as Partial<Settings> | null) ?? {}) };
  if (b.deposit_status !== "a_payer" || b.deposit_mad <= 0 || !cmiConfigured(settings.cmi_client_id)) redirect(`/reserver/confirmation/${b.id}`);

  const origin = await siteOrigin();
  const form = cmiForm({
    clientId: settings.cmi_client_id,
    amount: b.deposit_mad,
    oid: b.ref,
    okUrl: `${origin}/reserver/confirmation/${b.id}?paiement=ok`,
    failUrl: `${origin}/reserver/confirmation/${b.id}?paiement=echec`,
    callbackUrl: `${origin}/api/cmi`,
    shopUrl: `${origin}/reserver`,
    name: b.full_name,
    email: b.email,
    phone: b.phone,
  });

  return (
    <div className="flex flex-col items-center text-center">
      <CreditCard className="size-8 text-slate-400" />
      <h1 className="mt-3 text-xl font-semibold text-ink">Paiement de l&apos;acompte</h1>
      <p className="mt-1 text-[13px] text-muted">
        {mad(b.deposit_mad)} pour {b.service}. Vous allez être redirigé vers la page sécurisée du CMI.
      </p>
      <AutoSubmit action={form.action} params={form.params} label={`Payer ${mad(b.deposit_mad)}`} />
    </div>
  );
}
