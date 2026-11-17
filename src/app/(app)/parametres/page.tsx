import type { ReactNode } from "react";
import { Building2, CalendarCheck, CreditCard, Gift, MessageCircle, Save, Star } from "lucide-react";
import { requireDirection } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtTime } from "@/lib/utils";
import { saveSettings } from "@/actions/settings";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { InvoiceLegal } from "@/components/finance/invoice-legal";

export const metadata = { title: "Paramètres" };

function Section({ id, title, subtitle, icon, children }: { id: string; title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader title={title} subtitle={subtitle} icon={icon} />
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 [&>*]:min-w-0">{children}</div>
    </Card>
  );
}

function Toggle({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked: boolean; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3.5 py-3 sm:col-span-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-[#1a6d8e]" />
      <span>
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function SecretNote({ envName, present, what }: { envName: string; present: boolean; what: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3.5 py-3 text-xs text-muted sm:col-span-2">
      <p>
        Par sécurité, {what} ne s&apos;enregistre pas ici : ajoutez-la dans la variable d&apos;environnement <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-ink">{envName}</code> du serveur, puis redémarrez l&apos;application.
      </p>
      <Badge tone={present ? "green" : "gray"} dot>
        {present ? "Détectée" : "Absente"}
      </Badge>
    </div>
  );
}

const NAV = [
  ["entreprise", "Entreprise & factures"],
  ["fidelite", "Fidélité"],
  ["avis", "Avis Google"],
  ["whatsapp", "WhatsApp"],
  ["cmi", "Paiement CMI"],
  ["reservation", "Réservation"],
] as const;

export default async function ParametresPage() {
  await requireDirection();
  const s = await getSettings();
  const never = new Date(s.updated_at).getTime() === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Paramètres"
        subtitle={never ? "Réglages communs aux 7 établissements du groupe" : `Dernière modification le ${fmtDate(s.updated_at)} à ${fmtTime(s.updated_at)}`}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[180px_1fr] [&>*]:min-w-0">
        <nav className="no-print -mx-1 flex gap-1 overflow-x-auto px-1 lg:sticky lg:top-5 lg:flex-col">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium text-slate-500 transition hover:bg-white hover:text-ink">
              {label}
            </a>
          ))}
        </nav>

        <ActionForm action={saveSettings} className="space-y-5">
          <Section id="entreprise" title="Entreprise & factures" subtitle="Mentions légales imprimées sur chaque facture" icon={<Building2 />}>
            <Field label="Raison sociale" className="sm:col-span-2">
              <Input name="company_name" defaultValue={s.company_name} required />
            </Field>
            <Field label="Adresse" className="sm:col-span-2">
              <Input name="address" defaultValue={s.address} />
            </Field>
            <Field label="Téléphone">
              <Input name="phone" type="tel" defaultValue={s.phone} />
            </Field>
            <Field label="E-mail">
              <Input name="email" type="email" defaultValue={s.email} />
            </Field>
            <Field label="ICE" hint="Identifiant commun de l'entreprise, 15 chiffres">
              <Input name="ice" inputMode="numeric" maxLength={15} defaultValue={s.ice} className="tabular-nums" />
            </Field>
            <Field label="RC (registre du commerce)">
              <Input name="rc" defaultValue={s.rc} />
            </Field>
            <Field label="IF (identifiant fiscal)">
              <Input name="if_number" defaultValue={s.if_number} className="tabular-nums" />
            </Field>
            <Field label="Patente">
              <Input name="patente" defaultValue={s.patente} className="tabular-nums" />
            </Field>
            <Field label="TVA (%)" hint="Les prix saisis sont TTC ; la facture détaille HT et TVA">
              <Input name="vat_rate" inputMode="decimal" defaultValue={String(s.vat_rate)} required className="tabular-nums" />
            </Field>
            <div className="hidden sm:block" />
            <Field label="Pied de facture" className="sm:col-span-2">
              <Textarea name="invoice_footer" defaultValue={s.invoice_footer} className="min-h-[64px]" placeholder="Ex. : capital social, conditions, remerciements" />
            </Field>
            <div className="rounded-lg border border-dashed border-line p-4 sm:col-span-2">
              <p className="mb-3 text-xs font-medium text-muted">Aperçu sur une facture de 1 200 MAD (valeurs enregistrées)</p>
              <InvoiceLegal settings={s} totalTtc={1200} />
            </div>
          </Section>

          <Section id="fidelite" title="Fidélité" subtitle="Points gagnés à chaque vente et parrainage" icon={<Gift />}>
            <Field label="Points par tranche de 10 MAD">
              <Input name="loyalty_points_per_10mad" inputMode="decimal" defaultValue={String(s.loyalty_points_per_10mad)} required className="tabular-nums" />
            </Field>
            <Field label="Valeur d'un point (MAD)">
              <Input name="loyalty_point_value_mad" inputMode="decimal" defaultValue={String(s.loyalty_point_value_mad)} required className="tabular-nums" />
            </Field>
            <Field label="Bonus de parrainage (points)" hint="Offert au parrain quand le filleul achète">
              <Input name="referral_bonus_points" inputMode="numeric" defaultValue={String(s.referral_bonus_points)} required className="tabular-nums" />
            </Field>
            <p className="self-end pb-1 text-xs text-muted">
              Avec les réglages actuels, une vente de 500 MAD rapporte {Math.floor((500 / 10) * s.loyalty_points_per_10mad)} points, soit{" "}
              {(Math.floor((500 / 10) * s.loyalty_points_per_10mad) * s.loyalty_point_value_mad).toLocaleString("fr-FR")} MAD de réduction future (
              {Math.round(s.loyalty_points_per_10mad * s.loyalty_point_value_mad * 10)} % reversés).
            </p>
          </Section>

          <Section id="avis" title="Avis Google" subtitle="Lien envoyé aux clients satisfaits" icon={<Star />}>
            <Field label="Lien pour laisser un avis" hint="Google Business Profile → « Demander des avis » → copier le lien" className="sm:col-span-2">
              <Input name="google_review_url" type="url" defaultValue={s.google_review_url} placeholder="https://g.page/r/…/review" />
            </Field>
          </Section>

          <Section id="whatsapp" title="WhatsApp Business" subtitle="Rappels de rendez-vous et campagnes via l'API Cloud de Meta" icon={<MessageCircle />}>
            <Field label="Phone number ID" hint="Meta for Developers → WhatsApp → Configuration de l'API" className="sm:col-span-2">
              <Input name="whatsapp_phone_id" inputMode="numeric" defaultValue={s.whatsapp_phone_id} placeholder="Ex. : 109876543210987" className="tabular-nums" />
            </Field>
            <SecretNote envName="WHATSAPP_TOKEN" present={!!process.env.WHATSAPP_TOKEN} what="la clé d'accès (token)" />
            <Toggle name="whatsapp_enabled" label="Activer l'envoi de messages WhatsApp" defaultChecked={s.whatsapp_enabled} hint="Désactivé : les messages sont seulement préparés (lien wa.me)." />
          </Section>

          <Section id="cmi" title="Paiement en ligne CMI" subtitle="Paiement par carte des acomptes et achats en ligne" icon={<CreditCard />}>
            <Field label="Client ID (identifiant marchand)" className="sm:col-span-2">
              <Input name="cmi_client_id" defaultValue={s.cmi_client_id} placeholder="Fourni par le CMI" className="tabular-nums" />
            </Field>
            <SecretNote envName="CMI_STORE_KEY" present={!!process.env.CMI_STORE_KEY} what="la clé secrète du magasin (store key)" />
            <Toggle name="cmi_enabled" label="Activer le paiement en ligne" defaultChecked={s.cmi_enabled} />
          </Section>

          <Section id="reservation" title="Réservation en ligne" subtitle="Rendez-vous pris par les clients sur le site" icon={<CalendarCheck />}>
            <Field label="Acompte demandé (MAD)" hint="0 = aucun acompte. Nécessite le paiement CMI activé.">
              <Input name="booking_deposit_mad" inputMode="decimal" defaultValue={String(s.booking_deposit_mad)} required className="tabular-nums" />
            </Field>
          </Section>

          <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 rounded-xl border border-line bg-white/95 px-4 py-3 backdrop-blur lg:bottom-4">
            <p className="mr-auto hidden text-xs text-muted sm:block">Les modifications s&apos;appliquent à tous les établissements.</p>
            <SubmitButton variant="brand">
              <Save className="size-4" /> Enregistrer
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
