import Link from "next/link";
import { Gift, History, Ticket, UserPlus } from "lucide-react";
import type { ContactTabProps } from "./types";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import type { Contact } from "@/lib/types";
import type { GiftCard, LedgerRow, Referral } from "@/lib/types-loyalty";
import { fmtDate, mad } from "@/lib/utils";
import { pointsValue, referralCode } from "@/lib/loyalty";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Select } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { RedeemForm } from "@/components/loyalty/redeem-form";
import { GiftStatusBadge, LEDGER_LABEL, PointsDelta, ValidAt, pts } from "@/components/loyalty/bits";
import { adjustPoints, markVoucherUsed } from "@/actions/loyalty";

/** Onglet « Fidélité » de la fiche client : points du groupe, bons, cartes cadeaux, parrainage */
export async function ContactLoyalty({ contact, scope, me }: ContactTabProps) {
  const supabase = await createClient();
  const [settings, { data: ledgerRows }, { data: asBeneficiary }, { data: asBuyer }, { data: refOut }, { data: refIn }] = await Promise.all([
    getSettings(),
    supabase.from("loyalty_ledger").select("*").eq("contact_id", contact.id).order("created_at", { ascending: false }),
    supabase.from("gift_cards").select("*").eq("beneficiary_contact_id", contact.id),
    supabase.from("gift_cards").select("*").eq("buyer_contact_id", contact.id),
    supabase.from("referrals").select("*").eq("referrer_id", contact.id),
    supabase.from("referrals").select("*").eq("referee_id", contact.id),
  ]);
  const ledger = (ledgerRows ?? []) as LedgerRow[];
  const balance = ledger.reduce((a, r) => a + Number(r.points), 0);
  const earned = ledger.filter((r) => r.points > 0).reduce((a, r) => a + Number(r.points), 0);
  const vouchers = ledger.filter((r) => r.voucher_code && !r.voucher_used);
  const cards = [...new Map([...((asBeneficiary ?? []) as GiftCard[]), ...((asBuyer ?? []) as GiftCard[])].map((c) => [c.id, c])).values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const godchildren = (refOut ?? []) as Referral[];
  const sponsor = ((refIn ?? []) as Referral[])[0];

  const relatedIds = [...new Set([...godchildren.map((r) => r.referee_id), ...(sponsor ? [sponsor.referrer_id] : [])])];
  const { data: relRows } = relatedIds.length ? await supabase.from("contacts").select("id, full_name").in("id", relatedIds) : { data: [] };
  const names = new Map(((relRows ?? []) as Pick<Contact, "id" | "full_name">[]).map((c) => [c.id, c.full_name]));

  const entities = scope.allowed.map((e) => ({ id: e.id, short: e.short }));
  const defaultEntity = scope.current?.id ?? contact.entity_ids.find((e) => entities.some((x) => x.id === e)) ?? entities[0]?.id ?? "sports";
  const canAdjust = me.role === "direction" || me.role === "manager";
  const code = referralCode(contact);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
      <div className="space-y-6">
        {/* Solde */}
        <Card className="p-5">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[13px] text-muted">Solde</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{pts(balance)}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted">Valeur</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{mad(pointsValue(Math.max(0, balance), settings))}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted">Cumul gagné</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-500">{pts(earned)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">Points valables dans les 7 établissements Moov&apos;Up · {settings.loyalty_points_per_10mad} point par tranche de 10 MAD.</p>
        </Card>

        {/* Utiliser des points */}
        <Card>
          <CardHeader title="Utiliser des points" subtitle="Crée un bon de réduction à déduire en caisse" icon={<Ticket />} />
          <div className="px-5 pb-5">
            {balance > 0 ? (
              <RedeemForm contactId={contact.id} balance={balance} pointValue={Number(settings.loyalty_point_value_mad)} entities={entities} defaultEntity={defaultEntity} />
            ) : (
              <p className="text-[13px] text-muted">Aucun point disponible pour l&apos;instant : ils sont crédités à chaque achat.</p>
            )}
            {vouchers.length > 0 && (
              <ul className="mt-5 divide-y divide-line rounded-lg border border-line">
                {vouchers.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                    <span className="font-mono text-[13px] font-semibold">{v.voucher_code}</span>
                    <Badge tone="amber">À utiliser</Badge>
                    <span className="text-[13px] tabular-nums text-slate-600">{mad(v.value_mad)}</span>
                    <EntityBadge id={v.entity_id} />
                    <span className="flex-1" />
                    <form action={markVoucherUsed}>
                      <input type="hidden" name="id" value={v.id} />
                      <Button variant="secondary" className="h-8 px-2.5">
                        Marquer utilisé
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Historique */}
        <Card className="overflow-hidden">
          <CardHeader title="Historique des points" icon={<History />} subtitle={ledger.length ? `${ledger.length} mouvement${ledger.length > 1 ? "s" : ""}` : undefined} />
          {ledger.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {ledger.slice(0, 60).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ink">
                      {LEDGER_LABEL[r.kind]}
                      {r.note ? <span className="text-muted"> · {r.note}</span> : null}
                      {r.voucher_code ? <span className="font-mono text-xs text-muted"> {r.voucher_code}</span> : null}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <span>{fmtDate(r.created_at)}</span>
                      <EntityBadge id={r.entity_id} />
                    </p>
                  </div>
                  <PointsDelta points={Number(r.points)} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<History />} title="Aucun mouvement" text="Les points apparaissent dès la première vente liée à ce client." />
          )}
        </Card>
      </div>

      <div className="space-y-6">
        {/* Parrainage */}
        <Card>
          <CardHeader title="Parrainage" icon={<UserPlus />} />
          <div className="space-y-3 px-5 pb-5">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
              <span className="text-[13px] text-muted">Code à partager</span>
              <span className="font-mono text-sm font-semibold tracking-wider">{code}</span>
            </div>
            {sponsor && (
              <p className="text-[13px] text-muted">
                Parrainé(e) par{" "}
                <Link href={`/contacts/${sponsor.referrer_id}?tab=fidelite`} className="font-medium text-brand-600 hover:underline">
                  {names.get(sponsor.referrer_id) ?? "un client"}
                </Link>
                {sponsor.status === "en_attente" ? " · bonus au premier achat" : ""}
              </p>
            )}
            {godchildren.length ? (
              <ul className="divide-y divide-line">
                {godchildren.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-2 text-[13px]">
                    <Link href={`/contacts/${r.referee_id}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:text-brand-600">
                      {names.get(r.referee_id) ?? "Filleul"}
                    </Link>
                    {r.status === "valide" ? <Badge tone="green">+{r.bonus_points} pts</Badge> : <Badge tone="amber">En attente</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">
                Aucun filleul. {settings.referral_bonus_points} points offerts au premier achat de chaque ami parrainé.{" "}
                <Link href="/fidelite?tab=parrainage" className="font-medium text-brand-600 hover:underline">
                  Ajouter
                </Link>
              </p>
            )}
          </div>
        </Card>

        {/* Cartes cadeaux */}
        <Card>
          <CardHeader
            title="Cartes cadeaux"
            icon={<Gift />}
            action={
              <Link href="/fidelite/cartes/nouvelle" className="text-brand-600 hover:underline">
                Nouvelle
              </Link>
            }
          />
          {cards.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {cards.map((c) => (
                <li key={c.id}>
                  <Link href={`/fidelite/cartes/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/70">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold">{c.code}</span>
                        <GiftStatusBadge card={c} />
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <span>{c.beneficiary_contact_id === contact.id ? "Reçue" : "Offerte"}</span>
                        <ValidAt ids={c.entity_ids} />
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{mad(c.balance_mad)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">Aucune carte cadeau.</p>
          )}
        </Card>

        {canAdjust && (
          <details className="group rounded-xl border border-line bg-white [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer px-5 py-3.5 text-[13px] font-medium text-slate-700">Ajuster le solde (geste commercial, correction)</summary>
            <ActionForm action={adjustPoints} className="space-y-3 px-5 pb-5">
              <input type="hidden" name="contact_id" value={contact.id} />
              <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <Field label="Points" hint="Négatif pour retirer">
                  <Input name="points" inputMode="numeric" required placeholder="50" />
                </Field>
                <Field label="Établissement">
                  <Select name="entity_id" defaultValue={defaultEntity}>
                    {entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.short}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Raison">
                <Input name="note" required maxLength={120} placeholder="Geste commercial" />
              </Field>
              <SubmitButton variant="secondary">Ajuster</SubmitButton>
            </ActionForm>
          </details>
        )}
      </div>
    </div>
  );
}
