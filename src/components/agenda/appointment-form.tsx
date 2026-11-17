"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ClipboardList, DoorOpen, Save, UserRound } from "lucide-react";
import type { EntityId } from "@/lib/entities";
import type { AppointmentStatus } from "@/lib/types";
import { APPT_STATUS_LABEL, agadirToIso, cn, fmtTime, mad } from "@/lib/utils";
import { ActionForm, type FormState } from "@/components/action-form";
import { ContactPicker, type PickerContact } from "@/components/contact-picker";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import { EntityIcon } from "@/components/entity-icon";

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

  const endOf = (b: BusySlot) => new Date(new Date(b.starts_at).getTime() + b.duration_min * 60000).toISOString();
  const staffName = (id: string) => staff.find((s) => s.id === id)?.full_name ?? "Le praticien";

  return (
    <ActionForm action={action} className="space-y-0">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <div className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
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
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                <b>{staffName(conflicts.staff.staff_id ?? "")}</b> a déjà un rendez-vous de {fmtTime(conflicts.staff.starts_at)} à {fmtTime(endOf(conflicts.staff))} ({conflicts.staff.service}). Changez l&apos;horaire ou le praticien pour enregistrer.
              </span>
            </p>
          )}
          {conflicts.room && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                La salle <b>{room}</b> est déjà occupée de {fmtTime(conflicts.room.starts_at)} à {fmtTime(endOf(conflicts.room))} ({conflicts.room.service}). Vous pouvez enregistrer quand même.
              </span>
            </p>
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
          <div
            className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl"
            style={{ background: ent ? `linear-gradient(135deg, ${ent.color}, ${ent.color}cc)` : "linear-gradient(135deg,#1a6d8e,#3f8fae)" }}
          >
            <span className="pointer-events-none absolute -bottom-6 -right-6 text-white/15">
              <EntityIcon id={entityId || null} className="size-32" />
            </span>
            <p className="relative text-xs font-bold uppercase tracking-wide text-white/80">{ent?.short ?? "Établissement"}</p>
            <p className="relative mt-2 font-display text-xl font-extrabold leading-tight">{service || "Prestation à choisir"}</p>
            <p className="relative mt-3 font-display text-3xl font-extrabold">{mad(Number(String(price).replace(",", ".")) || 0)}</p>
            <div className="relative mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-white/20 px-2.5 py-1">{date ? new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : "Date ?"}</span>
              <span className="rounded-full bg-white/20 px-2.5 py-1">{time || "--:--"}</span>
              <span className="rounded-full bg-white/20 px-2.5 py-1">{duration || "?"} min</span>
              {room && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1">
                  <DoorOpen className="size-3" /> {room}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <SubmitButton className={cn("h-12 w-full rounded-2xl", conflicts.staff && "opacity-70")}>
              <Save className="size-4" /> {defaults.id ? "Enregistrer les modifications" : "Créer le rendez-vous"}
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
