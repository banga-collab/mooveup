"use client";

import { useMemo, useState } from "react";
import { BadgePercent, CalendarRange, CreditCard, Package, RefreshCw, Save, UserRound } from "lucide-react";
import type { EntityId } from "@/lib/entities";
import type { PayMethod } from "@/lib/types";
import { PAY_LABEL, addDaysKey, cn, mad } from "@/lib/utils";
import { ActionForm, type FormState } from "@/components/action-form";
import { ContactPicker, type PickerContact } from "@/components/contact-picker";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, SectionTitle, Select } from "@/components/ui";
import { EntityIcon } from "@/components/entity-icon";

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
  today,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  contacts: PickerContact[];
  entities: PlanEntity[];
  plans: Plan[];
  defaultContactId: string | null;
  defaultEntityId: EntityId | null;
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
        <div className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
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
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-slate-600 hover:border-accent-200 hover:text-accent-600"
              >
                <BadgePercent className="size-3.5" /> −{p} %
              </button>
            ))}
          </div>

          <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-2xl border border-line p-4 transition hover:bg-canvas">
            <input type="checkbox" name="auto_renew" className="size-5 accent-[#1a6d8e]" />
            <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-500">
              <RefreshCw className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">Renouvellement automatique</span>
              <span className="block text-xs text-muted">À proposer au client à la fin de la période</span>
            </span>
          </label>
        </div>

        {/* Récapitulatif */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl" style={{ background: ent ? `linear-gradient(135deg, ${ent.color}, ${ent.color}cc)` : "linear-gradient(135deg,#1a6d8e,#3f8fae)" }}>
            <span className="pointer-events-none absolute -bottom-6 -right-6 text-white/15">
              <EntityIcon id={entityId || null} className="size-32" />
            </span>
            <p className="relative text-xs font-bold uppercase tracking-wide text-white/80">{ent?.short ?? "Établissement"}</p>
            <p className="relative mt-2 font-display text-xl font-extrabold leading-tight">{plan?.name ?? "Formule à choisir"}</p>
            <p className="relative mt-3 font-display text-3xl font-extrabold">{mad(total)}</p>
            {num(discount) > 0 && <p className="relative text-xs text-white/80">au lieu de {mad(num(price))}</p>}
            <div className="relative mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
              {end && (
                <span className="rounded-full bg-white/20 px-2.5 py-1">
                  {fmt(start)} → {fmt(end)}
                </span>
              )}
              {plan?.kind === "pack" && sessions && <span className="rounded-full bg-white/20 px-2.5 py-1">{sessions} séances</span>}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-white p-4 text-sm shadow-card">
            <div className="flex justify-between">
              <span className="text-muted">Payé ({PAY_LABEL[method]})</span>
              <b>{mad(Math.min(paidNum, total))}</b>
            </div>
            <div className={cn("mt-1 flex justify-between", total - paidNum > 0 ? "text-red-600" : "text-emerald-600")}>
              <span>Reste à payer</span>
              <b>{mad(Math.max(0, total - paidNum))}</b>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <SubmitButton className="h-12 w-full rounded-2xl">
              <Save className="size-4" /> Créer l&apos;abonnement
            </SubmitButton>
            <a href={cancelHref} className="inline-flex h-11 items-center justify-center rounded-2xl text-sm font-semibold text-muted transition hover:bg-white hover:text-ink">
              Annuler
            </a>
          </div>
        </aside>
      </div>
    </ActionForm>
  );
}
