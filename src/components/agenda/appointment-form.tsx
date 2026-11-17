"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ClipboardList, DoorOpen, Repeat, Save, UserRound } from "lucide-react";
import type { EntityId } from "@/lib/entities";
import type { AppointmentStatus } from "@/lib/types";
import { APPT_STATUS_LABEL, agadirToIso, cn, fmtTime, mad } from "@/lib/utils";
import { REPEAT_LABEL, type RepeatFreq } from "@/lib/types-agenda";
import { MAX_OCCURRENCES, isFreq, seriesDates, shortDay } from "./recurrence";
import { ActionForm, type FormState } from "@/components/action-form";
import { ContactPicker, type PickerContact } from "@/components/contact-picker";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, SectionTitle, Select, Textarea, buttonClass } from "@/components/ui";

export type FormEntity = { id: EntityId; short: string; color: string; soft: string };
export type FormItem = { id: string; entity_id: EntityId; kind: string; name: string; category: string; price_mad: number; duration_min: number | null };
export type FormStaff = { id: string; full_name: string; entity_ids: EntityId[]; job_title: string | null };
export type BusySlot = { id: string; entity_id: EntityId; staff_id: string | null; room: string | null; starts_at: string; duration_min: number; service: string };

export type AppointmentDefaults = {
  id?: string;
  contact_id: string | null;
  entity_id: EntityId | null;
  item_id: string | null;
  service: string;
  staff_id: string | null;
  date: string;
  time: string;
  duration_min: number;
  price_mad: number;
  room: string;
  notes: string;
  status?: AppointmentStatus;
  /** Rendez-vous rattaché à une série (modification) */
  series_id?: string | null;
  series_label?: string | null;
};

const OTHER = "__autre";

export function AppointmentForm({
  action,
  contacts,
  entities,
  items,
  staff,
  busy,
  rooms,
  defaults,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  contacts: PickerContact[];
  entities: FormEntity[];
  items: FormItem[];
  staff: FormStaff[];
  busy: BusySlot[];
  rooms: Record<string, string[]>;
  defaults: AppointmentDefaults;
  cancelHref: string;
}) {
  const [entityId, setEntityId] = useState<EntityId | "">(defaults.entity_id ?? entities[0]?.id ?? "");
  const [itemId, setItemId] = useState<string>(defaults.item_id ?? (defaults.service ? OTHER : ""));
  const [service, setService] = useState(defaults.service);
  const [staffId, setStaffId] = useState(defaults.staff_id ?? "");
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [duration, setDuration] = useState(String(defaults.duration_min));
  const [price, setPrice] = useState(String(defaults.price_mad));
  const [room, setRoom] = useState(defaults.room);
  const [repeat, setRepeat] = useState<RepeatFreq | "">("");
  const [endMode, setEndMode] = useState<"count" | "until">("count");
  const [count, setCount] = useState("6");
  const [until, setUntil] = useState("");
  const [applyTo, setApplyTo] = useState<"one" | "series">("one");

  const ent = entities.find((e) => e.id === entityId);
  const entItems = useMemo(() => items.filter((i) => i.entity_id === entityId), [items, entityId]);
  const categories = useMemo(() => [...new Set(entItems.map((i) => i.category))], [entItems]);
  const entStaff = useMemo(() => staff.filter((s) => entityId && s.entity_ids.includes(entityId)), [staff, entityId]);

  const changeEntity = (id: EntityId) => {
    setEntityId(id);
    if (itemId !== OTHER && !items.some((i) => i.id === itemId && i.entity_id === id)) {
      setItemId("");
      setService("");
    }
    if (staffId && !staff.some((s) => s.id === staffId && s.entity_ids.includes(id))) setStaffId("");
  };

  const changeItem = (id: string) => {
    setItemId(id);
    const it = items.find((i) => i.id === id);
    if (it) {
      setService(it.name);
      setPrice(String(it.price_mad));
      if (it.duration_min) setDuration(String(it.duration_min));
    } else if (id === OTHER) setService("");
  };

  // Conflits (praticien : bloquant ; salle : avertissement)
  const conflicts = useMemo(() => {
    const dur = Number(duration);
    if (!date || !/^\d{1,2}:\d{2}$/.test(time) || !dur) return { staff: null, room: null };
    const s = new Date(agadirToIso(date, time)).getTime();
    const e = s + dur * 60000;
    const hit = (b: BusySlot) => {
      const bs = new Date(b.starts_at).getTime();
      return b.id !== defaults.id && s < bs + b.duration_min * 60000 && bs < e;
    };
    return {
      staff: staffId ? (busy.find((b) => b.staff_id === staffId && hit(b)) ?? null) : null,
      room: room.trim() ? (busy.find((b) => b.entity_id === entityId && b.room?.toLowerCase() === room.trim().toLowerCase() && hit(b)) ?? null) : null,
    };
  }, [busy, date, time, duration, staffId, room, entityId, defaults.id]);

  // Séances de la série et dates en conflit avec l'agenda du praticien
  const series = useMemo(() => {
    if (!repeat || !date) return null;
    const dates = seriesDates(date, repeat, endMode === "until" ? { until: until || null } : { count: Math.min(MAX_OCCURRENCES, Math.max(0, Number(count) || 0)) });
    const dur = Number(duration);
    const clash = new Set<string>();
    if (staffId && dur && /^\d{1,2}:\d{2}$/.test(time)) {
      for (const d of dates) {
        const s = new Date(agadirToIso(d, time)).getTime();
        const e = s + dur * 60000;
        if (busy.some((b) => b.staff_id === staffId && new Date(b.starts_at).getTime() < e && s < new Date(b.starts_at).getTime() + b.duration_min * 60000)) clash.add(d);
      }
    }
    return { dates, clash };
  }, [repeat, date, endMode, until, count, staffId, time, duration, busy]);

  const endOf = (b: BusySlot) => new Date(new Date(b.starts_at).getTime() + b.duration_min * 60000).toISOString();
  const staffName = (id: string) => staff.find((s) => s.id === id)?.full_name ?? "Le praticien";

  return (
    <ActionForm action={action} className="space-y-0">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <div className="rounded-xl border border-line bg-white p-5 sm:p-6">
          <SectionTitle icon={<UserRound className="size-4" />}>Client</SectionTitle>
          <Field label="Client">
            <ContactPicker contacts={contacts} defaultId={defaults.contact_id} required />
          </Field>

          <SectionTitle icon={<ClipboardList className="size-4" />}>Prestation</SectionTitle>
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
            <Field label="Prestation" hint={entItems.length ? undefined : "Aucune prestation au catalogue : saisissez-la."}>
              <Select name="item_id" value={itemId === OTHER ? "" : itemId} onChange={(e) => changeItem(e.target.value || OTHER)}>
                <option value="">{entItems.length ? "Choisir…" : "Autre prestation"}</option>
                {categories.map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {entItems
                      .filter((i) => i.category === cat)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} · {mad(i.price_mad)}
                          {i.kind === "pack" ? " (pack)" : ""}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            {(!itemId || itemId === OTHER) && (
              <Field label="Nom de la prestation" className="sm:col-span-2">
                <Input name="service" value={service} onChange={(e) => setService(e.target.value)} placeholder="Ex. Consultation de suivi" required />
              </Field>
            )}
            {itemId && itemId !== OTHER && <input type="hidden" name="service" value={service} />}
            <Field label="Praticien">
              <Select name="staff_id" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">Sans praticien</option>
                {entStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {s.job_title ? ` · ${s.job_title}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Salle / cabine">
              <Input name="room" value={room} onChange={(e) => setRoom(e.target.value)} list="rdv-rooms" placeholder="Ex. Cabine 1" />
              <datalist id="rdv-rooms">
                {(rooms[entityId] ?? []).map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
          </div>

          <SectionTitle icon={<CalendarClock className="size-4" />}>Horaire</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 [&>*]:min-w-0">
            <Field label="Date" className="col-span-2 sm:col-span-1">
              <Input type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Heure">
              <Input type="time" name="time" value={time} onChange={(e) => setTime(e.target.value)} step={300} required />
            </Field>
            <Field label="Durée (min)">
              <Input type="number" name="duration_min" value={duration} onChange={(e) => setDuration(e.target.value)} min={5} max={600} step={5} required />
            </Field>
            <Field label="Prix (MAD)" className="col-span-2 sm:col-span-1">
              <Input name="price_mad" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          </div>

          {conflicts.staff && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                <b className="font-semibold">{staffName(conflicts.staff.staff_id ?? "")}</b> a déjà un rendez-vous de {fmtTime(conflicts.staff.starts_at)} à {fmtTime(endOf(conflicts.staff))} ({conflicts.staff.service}). Changez l&apos;horaire ou le praticien pour enregistrer.
              </span>
            </p>
          )}
          {conflicts.room && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                La salle <b className="font-semibold">{room}</b> est déjà occupée de {fmtTime(conflicts.room.starts_at)} à {fmtTime(endOf(conflicts.room))} ({conflicts.room.service}). Vous pouvez enregistrer quand même.
              </span>
            </p>
          )}

          {/* Répétition (création) */}
          {!defaults.id && (
            <>
              <SectionTitle icon={<Repeat className="size-4" />}>Répéter</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
                <Field label="Fréquence">
                  <Select name="repeat" value={repeat} onChange={(e) => setRepeat(isFreq(e.target.value) ? e.target.value : "")}>
                    <option value="">Ne pas répéter</option>
                    {(Object.keys(REPEAT_LABEL) as RepeatFreq[]).map((f) => (
                      <option key={f} value={f}>
                        {REPEAT_LABEL[f]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {repeat && (
                  <>
                    <Field label="Fin">
                      <Select name="repeat_end" value={endMode} onChange={(e) => setEndMode(e.target.value === "until" ? "until" : "count")}>
                        <option value="count">Après N séances</option>
                        <option value="until">Jusqu&apos;à une date</option>
                      </Select>
                    </Field>
                    {endMode === "count" ? (
                      <Field label="Nombre de séances">
                        <Input type="number" name="repeat_count" value={count} onChange={(e) => setCount(e.target.value)} min={2} max={MAX_OCCURRENCES} required />
                      </Field>
                    ) : (
                      <Field label="Dernière date">
                        <Input type="date" name="repeat_until" value={until} min={date} onChange={(e) => setUntil(e.target.value)} required />
                      </Field>
                    )}
                  </>
                )}
              </div>
              {series && series.dates.length > 0 && (
                <div className="mt-3 rounded-lg border border-line p-3">
                  <p className="text-[13px] text-slate-700">
                    <b className="font-semibold tabular-nums">{series.dates.length - series.clash.size}</b> séance{series.dates.length - series.clash.size > 1 ? "s" : ""} à {time || "--:--"}
                    {series.clash.size > 0 && (
                      <span className="text-red-700">
                        {" "}
                        · {series.clash.size} date{series.clash.size > 1 ? "s" : ""} en conflit
                      </span>
                    )}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {series.dates.map((d) => (
                      <li
                        key={d}
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[11.5px] font-medium capitalize tabular-nums",
                          series.clash.has(d) ? "bg-red-50 text-red-700 line-through" : "bg-slate-100 text-slate-600",
                        )}
                        title={series.clash.has(d) ? "Le praticien est déjà pris à cet horaire" : undefined}
                      >
                        {shortDay(d)}
                      </li>
                    ))}
                  </ul>
                  {series.clash.size > 0 && (
                    <label className="mt-3 flex items-start gap-2 text-[13px] text-slate-700">
                      <input type="checkbox" name="skip_conflicts" value="1" className="mt-0.5 size-4 accent-brand-500" />
                      <span>
                        Créer la série <b className="font-semibold">sans ces {series.clash.size} date{series.clash.size > 1 ? "s" : ""}</b> (vous pourrez les reprogrammer à la main).
                      </span>
                    </label>
                  )}
                </div>
              )}
            </>
          )}

          {/* Modification d'une séance d'une série */}
          {defaults.id && defaults.series_id && (
            <>
              <SectionTitle icon={<Repeat className="size-4" />}>Série{defaults.series_label ? ` · ${defaults.series_label}` : ""}</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Appliquer la modification à">
                {(
                  [
                    ["one", "Cette séance uniquement", "Les autres séances ne changent pas."],
                    ["series", "Toute la série", "Cette séance et toutes les suivantes (même décalage, même heure)."],
                  ] as const
                ).map(([v, label, hint]) => (
                  <label key={v} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition", applyTo === v ? "border-brand-400 bg-brand-50/50" : "border-line hover:bg-slate-50")}>
                    <input type="radio" name="apply_to" value={v} checked={applyTo === v} onChange={() => setApplyTo(v)} className="mt-0.5 size-4 accent-brand-500" />
                    <span>
                      <span className="block text-[13px] font-medium text-ink">{label}</span>
                      <span className="block text-xs text-muted">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <SectionTitle>Notes</SectionTitle>
          <Textarea name="notes" defaultValue={defaults.notes} placeholder="Peau sensible, première visite, rappeler la veille…" />

          {defaults.id && defaults.status && (
            <Field label="Statut" className="mt-4 sm:max-w-xs">
              <Select name="status" defaultValue={defaults.status}>
                {(Object.keys(APPT_STATUS_LABEL) as AppointmentStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {APPT_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {/* Récapitulatif */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-line bg-white p-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              {ent && <span className="size-2 rounded-full" style={{ background: ent.color }} />}
              {ent?.short ?? "Établissement"}
            </p>
            <p className="mt-2 text-sm font-semibold leading-snug text-ink">{service || "Prestation à choisir"}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-ink">{mad(Number(String(price).replace(",", ".")) || 0)}</p>
            <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Date</dt>
                <dd className="font-medium capitalize text-ink">
                  {date ? new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Heure</dt>
                <dd className="font-medium tabular-nums text-ink">
                  {time || "--:--"} · {duration || "?"} min
                </dd>
              </div>
              {room && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Salle</dt>
                  <dd className="inline-flex items-center gap-1 font-medium text-ink">
                    <DoorOpen className="size-3.5 text-slate-400" /> {room}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <div className="flex flex-col gap-2">
            <SubmitButton variant="brand" className={cn("h-10 w-full", conflicts.staff && "opacity-70")}>
              <Save /> {defaults.id ? (applyTo === "series" ? "Enregistrer la série" : "Enregistrer") : series ? `Créer ${series.dates.length - series.clash.size} rendez-vous` : "Créer le rendez-vous"}
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
