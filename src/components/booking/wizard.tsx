"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronRight, Clock, Loader2 } from "lucide-react";
import { createOnlineBooking, fetchSlots } from "@/actions/booking";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { EntityMark } from "@/components/entity-icon";
import { Field, Input } from "@/components/ui";
import { entity } from "@/lib/entities";
import { addDaysKey, cn, mad } from "@/lib/utils";

export type BookItem = { id: string; entity_id: string; name: string; category: string; price_mad: number; duration_min: number };

const DAYS_SHOWN = 21;
const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const asDate = (key: string) => new Date(`${key}T12:00:00Z`);
const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}` : `${min} min`);

export function BookingWizard({
  entities,
  items,
  today,
  initialEntity,
  initialItem,
  deposit,
  depositOnline,
  phone,
}: {
  entities: string[];
  items: BookItem[];
  today: string;
  initialEntity: string | null;
  initialItem: string | null;
  deposit: number;
  depositOnline: boolean;
  phone: string;
}) {
  const [entityId, setEntityId] = useState<string | null>(initialEntity ?? (initialItem ? items.find((i) => i.id === initialItem)?.entity_id ?? null : null));
  const [itemId, setItemId] = useState<string | null>(initialItem);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, start] = useTransition();

  const item = items.find((i) => i.id === itemId) ?? null;
  const ent = entity(entityId);
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDaysKey(today, i)), [today]);
  const services = useMemo(() => items.filter((i) => i.entity_id === entityId), [items, entityId]);
  const step = !ent ? 1 : !item ? 2 : !time ? 3 : 4;

  useEffect(() => {
    if (!item) return;
    let live = true;
    start(async () => {
      const s = await fetchSlots(item.entity_id, item.id, date);
      if (live) setSlots(s);
    });
    return () => {
      live = false;
    };
  }, [item, date]);

  const pickEntity = (id: string | null) => {
    setEntityId(id);
    setItemId(null);
    setTime(null);
    setSlots(null);
  };

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Réserver en ligne</h1>
      <p className="mt-1 text-[13px] text-muted">
        Étape {step} sur 4 · confirmation immédiate, sans création de compte.
      </p>
      <div className="mt-3 flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((s) => (
          <span key={s} className={cn("h-1 flex-1 rounded-full", s <= step ? "bg-brand-500" : "bg-slate-200")} />
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {/* 1. Établissement */}
        {!ent ? (
          <Section title="Où souhaitez-vous venir ?">
            <ul className="divide-y divide-line">
              {entities.map((id) => {
                const e = entity(id)!;
                return (
                  <li key={id}>
                    <button type="button" onClick={() => pickEntity(id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50">
                      <EntityMark id={id} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{e.name}</span>
                        <span className="block truncate text-xs text-muted">{e.tagline}</span>
                      </span>
                      <ChevronRight className="size-4 text-slate-300" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : (
          <Done label="Établissement" value={ent.name} onEdit={() => pickEntity(null)} />
        )}

        {/* 2. Prestation */}
        {ent &&
          (!item ? (
            <Section title="Quelle prestation ?">
              <ul className="divide-y divide-line">
                {services.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setItemId(s.id);
                        setTime(null);
                        setSlots(null);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{s.name}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                          <Clock className="size-3" /> {duration(s.duration_min)} · {s.category}
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-ink">{mad(s.price_mad)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : (
            <Done
              label="Prestation"
              value={`${item.name} · ${duration(item.duration_min)} · ${mad(item.price_mad)}`}
              onEdit={() => {
                setItemId(null);
                setTime(null);
              }}
            />
          ))}

        {/* 3. Date et heure */}
        {item &&
          (!time ? (
            <Section title="Quand ?">
              <div className="-mx-px overflow-x-auto px-4 pb-1 pt-1">
                <div className="flex gap-1.5">
                  {days.map((d) => {
                    const dd = asDate(d);
                    const active = d === date;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDate(d)}
                        className={cn(
                          "flex w-14 shrink-0 flex-col items-center rounded-lg border py-2 transition",
                          active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-slate-600 hover:border-slate-300",
                        )}
                        aria-pressed={active}
                      >
                        <span className="text-[11px] capitalize">{d === today ? "Auj." : dayFmt.format(dd).replace(".", "")}</span>
                        <span className="text-base font-semibold tabular-nums">{dd.getUTCDate()}</span>
                        <span className="text-[10.5px] text-muted">{monthFmt.format(dd).replace(".", "")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-4 pb-4 pt-3">
                <p className="mb-2 text-[13px] font-medium text-slate-700 first-letter:uppercase">{longFmt.format(asDate(date))}</p>
                {loading || slots === null ? (
                  <p className="flex items-center gap-2 py-4 text-[13px] text-muted">
                    <Loader2 className="size-4 animate-spin" /> Recherche des créneaux libres…
                  </p>
                ) : slots.length ? (
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                    {slots.map((s) => (
                      <button key={s} type="button" onClick={() => setTime(s)} className="h-10 rounded-lg border border-line text-sm font-medium tabular-nums text-ink transition hover:border-brand-400 hover:bg-brand-50">
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-[13px] text-muted">Aucun créneau libre ce jour-là. Choisissez une autre date.</p>
                )}
              </div>
            </Section>
          ) : (
            <Done label="Rendez-vous" value={`${longFmt.format(asDate(date))} à ${time}`} onEdit={() => setTime(null)} />
          ))}

        {/* 4. Coordonnées */}
        {item && time && (
          <Section title="Vos coordonnées">
            <ActionForm action={createOnlineBooking} className="space-y-4 p-4">
              <input type="hidden" name="entity_id" value={item.entity_id} />
              <input type="hidden" name="item_id" value={item.id} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="time" value={time} />
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              <Field label="Nom et prénom">
                <Input name="full_name" required minLength={3} maxLength={80} autoComplete="name" />
              </Field>
              <Field label="Téléphone (WhatsApp)">
                <Input name="phone" type="tel" inputMode="tel" required placeholder="06 12 34 56 78" autoComplete="tel" />
              </Field>
              <Field label="E-mail (facultatif)">
                <Input name="email" type="email" autoComplete="email" />
              </Field>
              <label className="flex items-start gap-2.5 text-[13px] text-slate-600">
                <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0" />
                <span>J&apos;accepte que Moov&apos;Up utilise ces coordonnées pour gérer mon rendez-vous et me contacter (téléphone, WhatsApp).</span>
              </label>
              {deposit > 0 && (
                <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600">
                  Un acompte de <span className="font-semibold text-ink">{mad(Math.min(deposit, item.price_mad || deposit))}</span> est demandé
                  {depositOnline ? " : vous serez redirigé vers le paiement sécurisé CMI." : ", à régler à l'accueil le jour du rendez-vous."}
                </p>
              )}
              <SubmitButton variant="brand" className="h-11 w-full text-sm" pendingText="Réservation…">
                {deposit > 0 && depositOnline ? "Réserver et payer l'acompte" : "Confirmer la réservation"}
              </SubmitButton>
            </ActionForm>
          </Section>
        )}
      </div>

      <p className="mt-8 text-center text-xs text-muted">
        Une question ? Appelez-nous au{" "}
        <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-medium text-ink">
          {phone}
        </a>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white animate-fade-up">
      <h2 className="px-4 pb-2 pt-4 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Done({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block truncate text-sm font-medium first-letter:uppercase text-ink">{value}</span>
      </span>
      <button type="button" onClick={onEdit} className="text-[13px] font-medium text-brand-600 hover:text-brand-700">
        Modifier
      </button>
    </div>
  );
}
