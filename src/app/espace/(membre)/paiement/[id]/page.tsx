import { notFound, redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { cmiConfigured, cmiForm, siteOrigin } from "@/lib/access";
import { memberSettings, memberWriteDb, requireMember } from "@/lib/member-auth";
import { mad } from "@/lib/utils";
import type { MemberRequest } from "@/lib/types-member";
import { AutoSubmit } from "@/components/booking/auto-submit";
import { getMt } from "@/components/member/parts";

export const metadata = { title: "Paiement en ligne" };
export const dynamic = "force-dynamic";

/** Redirection vers la passerelle CMI pour un renouvellement demandé depuis l'espace */
export default async function MemberPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ contact }, { t }, { id }, settings] = await Promise.all([requireMember(), getMt(), params, memberSettings()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await memberWriteDb().from("member_requests").select("*").eq("id", id).eq("contact_id", contact.id).maybeSingle();
  const r = data as MemberRequest | null;
  if (!r) notFound();
  if (r.status !== "a_payer" || r.amount_mad <= 0 || !settings.cmi_enabled || !cmiConfigured(settings.cmi_client_id)) redirect("/espace/abonnements");

  const origin = await siteOrigin();
  const form = cmiForm({
    clientId: settings.cmi_client_id,
    amount: r.amount_mad,
    oid: r.ref,
    okUrl: `${origin}/espace/abonnements?paiement=ok`,
    failUrl: `${origin}/espace/abonnements?paiement=echec`,
    callbackUrl: `${origin}/espace/cmi`,
    shopUrl: `${origin}/espace/abonnements`,
    name: contact.full_name,
    email: contact.email,
    phone: contact.phone ?? "",
  });

  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <CreditCard className="size-8 text-slate-400" />
      <h1 className="mt-3 text-xl font-semibold text-ink">{t("m.subs.renew")}</h1>
      <p className="mt-1 text-[13px] text-muted">
        {r.label} · {mad(r.amount_mad)}
      </p>
      <p className="mt-1 text-xs text-muted">{t("m.subs.onlineNote")}</p>
      <AutoSubmit action={form.action} params={form.params} label={`${t("m.subs.payNow")} ${mad(r.amount_mad)}`} />
    </div>
  );
}
