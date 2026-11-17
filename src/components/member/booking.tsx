"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronRight, Clock, Loader2 } from "lucide-react";
import { fetchSlots } from "@/actions/booking";
import { bookMemberAppointment } from "@/actions/member";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { EntityMark } from "@/components/entity-icon";
import { Input } from "@/components/ui";
import { entity } from "@/lib/entities";
import { useLang } from "@/lib/i18n/client";
import { addDaysKey, cn, mad } from "@/lib/utils";
import { useMt } from "./use-mt";

export type MemberBookItem = { id: string; entity_id: string; name: string; category: string; price_mad: number; duration_min: number };

const DAYS_SHOWN = 21;
const asDate = (key: string) => new Date(`${key}T12:00:00Z`);
const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}` : `${min} min`);

/** Réservation en 3 étapes depuis l'espace adhérent (coordonnées déjà connues) */
export function MemberBooking({ entities, items, today, initialEntity }: { entities: string[]; items: MemberBookItem[]; today: string; initialEntity: string | null }) {
  const t = useMt();
  const lang = useLang();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const fmt = useMemo(
    () => ({
      day: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }),
      month: new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }),
      long: new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
    }),
    [locale],
  );
  const [entityId, setEntityId] = useState<string | null>(initialEntity && entities.includes(initialEntity) ? initialEntity : entities.length === 1 ? entities[0]! : null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, start] = useTransition();

  const item = items.find((i) => i.id === itemId) ?? null;
  const ent = entity(entityId);
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDaysKey(today, i)), [today]);
  const services = useMemo(() => items.filter((i) => i.entity_id === entityId), [items, entityId]);

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

  if (!entities.length) return <p className="rounded-xl border border-line bg-white p-4 text-[13px] text-muted">{t("m.book.none")}</p>;

  return (
    <div className="space-y-3">
      {!ent ? (
        <Section title={t("m.book.where")}>
          <ul className="divide-y divide-line">
            {entities.map((id) => {
              const e = entity(id)!;
              return (
                <li key={id}>
                  <button type="button" onClick={() => pickEntity(id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-slate-50">
                    <EntityMark id={id} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{e.name}</span>
                      <span className="block truncate text-xs text-muted">{e.tagline}</span>
                    </span>
                    <ChevronRight className="size-4 text-slate-300 rtl:rotate-180" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : (
        <Done label={t("m.book.where")} value={ent.name} onEdit={entities.length > 1 ? () => pickEntity(null) : undefined} edit={t("m.book.change")} />
      )}

      {ent &&
        (!item ? (
          <Section title={t("m.book.what")}>
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
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-slate-50"
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
            label={t("m.book.what")}
            value={`${item.name} · ${duration(item.duration_min)} · ${mad(item.price_mad)}`}
            edit={t("m.book.change")}
            onEdit={() => {
              setItemId(null);
              setTime(null);
            }}
          />
        ))}

      {item &&
        (!time ? (
          <Section title={t("m.book.when")}>
            <div className="overflow-x-auto px-4 pb-1 pt-1">
              <div className="flex gap-1.5">
                {days.map((d) => {
                  const dd = asDate(d);
                  const active = d === date;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDate(d)}
                      aria-pressed={active}
                      className={cn("flex w-14 shrink-0 flex-col items-center rounded-lg border py-2 transition", active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-slate-600 hover:border-slate-300")}
                    >
                      <span className="text-[11px] capitalize">{d === today ? t("m.book.today") : fmt.day.format(dd).replace(".", "")}</span>
                      <span className="text-base font-semibold tabular-nums">{dd.getUTCDate()}</span>
                      <span className="text-[10.5px] text-muted">{fmt.month.format(dd).replace(".", "")}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-4 pb-4 pt-3">
              <p className="mb-2 text-[13px] font-medium text-slate-700 first-letter:uppercase">{fmt.long.format(asDate(date))}</p>
              {loading || slots === null ? (
                <p className="flex items-center gap-2 py-4 text-[13px] text-muted">
                  <Loader2 className="size-4 animate-spin" /> {t("m.book.loading")}
                </p>
              ) : slots.length ? (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {slots.map((s) => (
                    <button key={s} type="button" onClick={() => setTime(s)} className="h-11 rounded-lg border border-line text-sm font-medium tabular-nums text-ink transition hover:border-brand-400 hover:bg-brand-50">
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-[13px] text-muted">{t("m.book.noSlot")}</p>
              )}
            </div>
          </Section>
        ) : (
          <>
            <Done label={t("m.book.when")} value={`${fmt.long.format(asDate(date))} · ${time}`} onEdit={() => setTime(null)} edit={t("m.book.change")} />
            <ActionForm action={bookMemberAppointment} className="space-y-3 rounded-xl border border-line bg-white p-4">
              <input type="hidden" name="entity_id" value={item.entity_id} />
              <input type="hidden" name="item_id" value={item.id} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="time" value={time} />
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("m.book.note")}</span>
                <Input name="note" maxLength={300} />
              </label>
              <SubmitButton variant="brand" className="h-11 w-full text-sm" pendingText="…">
                {t("m.book.confirmBtn")}
              </SubmitButton>
            </ActionForm>
          </>
        ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white">
      <h2 className="px-4 pb-2 pt-4 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Done({ label, value, onEdit, edit }: { label: string; value: string; onEdit?: () => void; edit: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block truncate text-sm font-medium text-ink first-letter:uppercase">{value}</span>
      </span>
      {onEdit && (
        <button type="button" onClick={onEdit} className="h-9 px-1 text-[13px] font-medium text-brand-600 hover:text-brand-700">
          {edit}
        </button>
      )}
    </div>
  );
}
