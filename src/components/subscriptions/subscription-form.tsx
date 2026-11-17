"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { BadgePercent, CalendarRange, CreditCard, Package, RefreshCw, Save, UserRound } from "lucide-react";
import type { EntityId } from "@/lib/entities";
import type { PayMethod } from "@/lib/types";
import { PAY_LABEL, addDaysKey, cn, mad } from "@/lib/utils";
import { ActionForm, type FormState } from "@/components/action-form";
import { ContactPicker, type PickerContact } from "@/components/contact-picker";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, SectionTitle, Select, buttonClass } from "@/components/ui";

export type PlanEntity = { id: EntityId; short: string; color: string };
export type Plan = { id: string; entity_id: EntityId; kind: "abonnement" | "pack"; name: string; category: string; price_mad: number; duration_days: number | null; sessions_count: number | null };

const num = (s: string) => {
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const PACK_DAYS = 90;

export function SubscriptionForm({
  action,
  contacts,
  entities,
  plans,
  defaultContactId,
  defaultEntityId,
  defaultPlanId,
  today,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  contacts: PickerContact[];
  entities: PlanEntity[];
  plans: Plan[];
  defaultContactId: string | null;
  defaultEntityId: EntityId | null;
  /** Formule pré-choisie (ex. « Renouveler » depuis l'accueil : ?formule=…) */
  defaultPlanId?: string | null;
  today: string;
  cancelHref: string;
}) {
  const [entityId, setEntityId] = useState<EntityId | "">(defaultEntityId ?? entities[0]?.id ?? "");
  const [planId, setPlanId] = useState("");
  const [start, setStart] = useState(today);
  const [days, setDays] = useState("30");
  const [sessions, setSessions] = useState("");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [method, setMethod] = useState<PayMethod>("especes");

  const ent = entities.find((e) => e.id === entityId);
  const entPlans = useMemo(() => plans.filter((p) => p.entity_id === entityId), [plans, entityId]);
  const plan = plans.find((p) => p.id === planId) ?? null;
  const total = Math.max(0, num(price) - num(discount));
  const paidNum = paidTouched ? num(paid) : total;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(start) && num(days) > 0 ? addDaysKey(start, Math.round(num(days))) : null;

  const choosePlan = (id: string) => {
    setPlanId(id);
    const p = plans.find((x) => x.id === id);
    if (!p) return;
    setPrice(String(p.price_mad));
    setDays(String(p.duration_days ?? PACK_DAYS));
    setSessions(p.kind === "pack" ? String(p.sessions_count ?? 1) : "");
    setDiscount("0");
    setPaidTouched(false);
  };

  // Formule pré-choisie : prix, durée et séances remplis dès l'ouverture
  const presetDone = useRef(false);
  useEffect(() => {
    if (presetDone.current || !defaultPlanId) return;
    presetDone.current = true;
    if (plans.some((p) => p.id === defaultPlanId)) choosePlan(defaultPlanId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPlanId]);
  const changeEntity = (id: EntityId) => {
    setEntityId(id);
    if (plan && plan.entity_id !== id) {
      setPlanId("");
      setPrice("");
    }
  };
  const fmt = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

  return (
    <ActionForm action={action}>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <div className="rounded-xl border border-line bg-white p-5 sm:p-6">
          <SectionTitle icon={<UserRound className="size-4" />}>Client</SectionTitle>
          <Field label="Client">
            <ContactPicker contacts={contacts} defaultId={defaultContactId} required />
          </Field>

          <SectionTitle icon={<Package className="size-4" />}>Formule</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Établissement">
              <Select name="entity_id" value={entityId} onChange={(e) => changeEntity(e.target.value as EntityId)} required>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.short}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Formule" hint={entPlans.length ? undefined : "Aucun abonnement ni pack au catalogue de cet établissement."}>
              <Select name="item_id" value={planId} onChange={(e) => choosePlan(e.target.value)} required>
                <option value="">Choisir…</option>
                {(["abonnement", "pack"] as const).map((k) => {
                  const list = entPlans.filter((p) => p.kind === k);
                  if (!list.length) return null;
                  return (
                    <optgroup key={k} label={k === "abonnement" ? "Abonnements" : "Packs de séances"}>
                      {list.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {mad(p.price_mad)}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </Select>
            </Field>
          </div>

          <SectionTitle icon={<CalendarRange className="size-4" />}>Période</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 [&>*]:min-w-0">
            <Field label="Date de début" className="col-span-2 sm:col-span-1">
              <Input type="date" name="start_date" value={start} onChange={(e) => setStart(e.target.value)} required />
            </Field>
            <Field label="Validité (jours)" hint={end ? `Jusqu'au ${fmt(end)}` : undefined}>
              <Input type="number" name="duration_days" value={days} onChange={(e) => setDays(e.target.value)} min={1} max={1100} required />
            </Field>
            {plan?.kind === "pack" && (
              <Field label="Séances">
                <Input type="number" name="sessions" value={sessions} onChange={(e) => setSessions(e.target.value)} min={1} max={500} required />
              </Field>
            )}
          </div>

          <SectionTitle icon={<CreditCard className="size-4" />}>Paiement</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 [&>*]:min-w-0">
            <Field label="Prix (MAD)">
              <Input name="price_mad" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </Field>
            <Field label="Remise (MAD)">
              <Input name="discount_mad" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </Field>
            <Field label="Mode de paiement">
              <Select name="method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                {(Object.keys(PAY_LABEL) as PayMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAY_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Montant payé">
              <Input
                name="paid_mad"
                inputMode="decimal"
                value={paidTouched ? paid : String(total)}
                onChange={(e) => {
                  setPaidTouched(true);
                  setPaid(e.target.value);
                }}
              />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[10, 15, 20].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDiscount(String(Math.round((num(price) * p) / 100)))}
                className={buttonClass("secondary", "px-3 text-xs")}
              >
                <BadgePercent /> −{p} %
              </button>
            ))}
          </div>

          <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3.5 transition hover:bg-slate-50">
            <input type="checkbox" name="auto_renew" className="size-4" />
            <RefreshCw className="size-4 shrink-0 text-slate-400" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">Renouvellement automatique</span>
              <span className="block text-xs text-muted">À proposer au client à la fin de la période</span>
            </span>
          </label>
        </div>

        {/* Récapitulatif */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-line bg-white p-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              {ent && <span className="size-2 rounded-full" style={{ background: ent.color }} />}
              {ent?.short ?? "Établissement"}
            </p>
            <p className="mt-2 text-sm font-semibold leading-snug text-ink">{plan?.name ?? "Formule à choisir"}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-ink">{mad(total)}</p>
            {num(discount) > 0 && <p className="text-xs tabular-nums text-muted line-through">{mad(num(price))}</p>}
            <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[13px]">
              {end && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Période</dt>
                  <dd className="text-right font-medium tabular-nums text-ink">
                    {fmt(start)} → {fmt(end)}
                  </dd>
                </div>
              )}
              {plan?.kind === "pack" && sessions && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Séances</dt>
                  <dd className="font-medium tabular-nums text-ink">{sessions}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Payé ({PAY_LABEL[method]})</dt>
                <dd className="font-medium tabular-nums text-ink">{mad(Math.min(paidNum, total))}</dd>
              </div>
              <div className={cn("flex justify-between gap-3", total - paidNum > 0 ? "text-red-600" : "text-emerald-700")}>
                <dt>Reste à payer</dt>
                <dd className="font-semibold tabular-nums">{mad(Math.max(0, total - paidNum))}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-col gap-2">
            <SubmitButton className="h-10 w-full">
              <Save /> Créer et encaisser
            </SubmitButton>
            <a href={cancelHref} className={buttonClass("ghost", "w-full")}>
              Annuler
            </a>
          </div>
        </aside>
      </div>
    </ActionForm>
  );
}
