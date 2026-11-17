import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Wallet } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import { entity } from "@/lib/entities";
import type { Profile } from "@/lib/types";
import type { GiftCard, GiftCardUse } from "@/lib/types-loyalty";
import { fmtDate, fmtTime, mad } from "@/lib/utils";
import { Card, CardHeader, DescList, Field, Input, PageHeader, Select } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { EntityBadge } from "@/components/entity-icon";
import { GiftCardVisual } from "@/components/loyalty/gift-card-visual";
import { PrintButton } from "@/components/loyalty/print-button";
import { GiftStatusBadge, ValidAt, giftState } from "@/components/loyalty/bits";
import { cancelGiftCard, spendGiftCard } from "@/actions/loyalty";

export const metadata = { title: "Carte cadeau" };

export default async function GiftCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const [{ data }, { data: useRows }, { data: people }] = await Promise.all([
    supabase.from("gift_cards").select("*").eq("id", id).maybeSingle(),
    supabase.from("gift_card_uses").select("*").eq("card_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("*"),
  ]);
  const card = data as GiftCard | null;
  if (!card) notFound();
  const uses = (useRows ?? []) as GiftCardUse[];
  const team = byId(people as Profile[]);
  const state = giftState(card);
  const usable = scope.allowed.filter((e) => !card.entity_ids.length || card.entity_ids.includes(e.id));
  const canManage = me.role === "direction" || me.role === "manager";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader back={<BackLink href="/fidelite?tab=cartes" label="Cartes cadeaux" />} title={<span className="font-mono">{card.code}</span>} subtitle={`Créée le ${fmtDate(card.created_at)}`} actions={<PrintButton label="Imprimer la carte" />} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="space-y-6">
          <GiftCardVisual card={card} />

          <Card className="no-print overflow-hidden">
            <CardHeader title="Utilisations" subtitle={uses.length ? `${mad(Number(card.amount_mad) - Number(card.balance_mad))} utilisés` : undefined} />
            {uses.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {uses.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <EntityBadge id={u.entity_id} />
                      <p className="mt-0.5 text-xs text-muted">
                        {fmtDate(u.created_at)} à {fmtTime(u.created_at)}
                        {u.author_id && team.get(u.author_id) ? ` · ${team.get(u.author_id)!.full_name}` : ""}
                        {u.note ? ` · ${u.note}` : ""}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">−{mad(u.amount_mad)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-[13px] text-muted">Pas encore utilisée.</p>
            )}
          </Card>
        </div>

        <div className="no-print space-y-6">
          <Card className="p-5">
            <p className="text-[13px] text-muted">Solde restant</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{mad(card.balance_mad)}</p>
            <p className="mt-1 text-xs text-muted">sur {mad(card.amount_mad)}</p>
            <div className="mt-4">
              <DescList
                items={[
                  ["Statut", <GiftStatusBadge key="s" card={card} />],
                  ["Valable", <ValidAt key="v" ids={card.entity_ids} />],
                  ["Expire le", fmtDate(card.expires_on)],
                  [
                    "Bénéficiaire",
                    card.beneficiary_contact_id ? (
                      <Link key="b" href={`/contacts/${card.beneficiary_contact_id}?tab=fidelite`} className="text-brand-600 hover:underline">
                        {card.beneficiary_name}
                      </Link>
                    ) : (
                      card.beneficiary_name ?? "–"
                    ),
                  ],
                  [
                    "Acheteur",
                    card.buyer_contact_id ? (
                      <Link key="a" href={`/contacts/${card.buyer_contact_id}?tab=fidelite`} className="text-brand-600 hover:underline">
                        {card.buyer_name}
                      </Link>
                    ) : (
                      card.buyer_name ?? "–"
                    ),
                  ],
                  ["Vendue par", entity(card.entity_id)?.short ?? "–"],
                ]}
              />
            </div>
          </Card>

          {state === "active" && usable.length > 0 && (
            <Card>
              <CardHeader title="Utiliser la carte" subtitle="Déduit le montant du solde" icon={<Wallet />} />
              <ActionForm action={spendGiftCard} className="space-y-4 px-5 pb-5">
                <input type="hidden" name="card_id" value={card.id} />
                <Field label="Montant à déduire (MAD)">
                  <Input name="amount" inputMode="decimal" required defaultValue={String(card.balance_mad)} className="tabular-nums" />
                </Field>
                <Field label="Établissement">
                  <Select name="entity_id" defaultValue={scope.current && usable.some((e) => e.id === scope.current!.id) ? scope.current.id : usable[0]!.id}>
                    {usable.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.short}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Prestation (facultatif)">
                  <Input name="note" maxLength={120} placeholder="Massage relaxant 60 min" />
                </Field>
                <SubmitButton variant="brand" className="w-full">
                  Déduire
                </SubmitButton>
              </ActionForm>
            </Card>
          )}

          {canManage && state === "active" && (
            <form action={cancelGiftCard}>
              <input type="hidden" name="id" value={card.id} />
              <ConfirmButton message={`Annuler la carte ${card.code} ? Le solde de ${mad(card.balance_mad)} ne sera plus utilisable.`} className="w-full">
                <Ban className="size-4" /> Annuler la carte
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
