"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CalendarClock, Check, Loader2, Minus, Plus, Search, ShoppingBag, Ticket, UserPlus, UserRound, X } from "lucide-react";
import type { EntityId } from "@/lib/entities";
import type { CatalogKind, PayMethod } from "@/lib/types";
import type { ExpressMode } from "@/lib/types-agenda";
import { PAY_LABEL, agadirToIso, cn, fmtTime, mad } from "@/lib/utils";
import { expressCheckout } from "@/actions/express";
import { matchText as matchesQuery } from "@/components/agenda/recurrence";
import { ContactLink } from "@/components/quick-view/contact-link";
import { Avatar, Field, Input, Kbd, Select, buttonClass } from "@/components/ui";

export type DeskContact = { id: string; full_name: string; phone: string | null; entity_ids: EntityId[] };
export type DeskEntity = { id: EntityId; short: string; color: string; kind: "sport" | "beaute" | "clinique" };
export type DeskItem = {
  id: string;
  entity_id: EntityId;
  kind: CatalogKind;
  name: string;
  category: string;
  price_mad: number;
  duration_min: number | null;
  duration_days: number | null;
  sessions_count: number | null;
  stock: number | null;
};
export type DeskStaff = { id: string; full_name: string; entity_ids: EntityId[]; job_title: string | null };
export type DeskBusy = { staff_id: string; starts_at: string; duration_min: number; service: string };

const MODES: { id: ExpressMode; label: string; kinds: CatalogKind[] }[] = [
  { id: "rdv", label: "Rendez-vous", kinds: ["prestation", "pack"] },
  { id: "abonnement", label: "Abonnement", kinds: ["abonnement", "pack"] },
  { id: "produit", label: "Produit", kinds: ["produit"] },
];
const PAY: PayMethod[] = ["especes", "carte", "virement", "cheque"];
const digits = (s: string) => s.replace(/\D/g, "");
const phoneKey = (p: string | null) => {
  let d = digits(p ?? "");
  if (d.startsWith("00212")) d = "0" + d.slice(5);
  else if (d.startsWith("212") && d.length === 12) d = "0" + d.slice(3);
  return d;
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Prochain quart d'heure (heure d'Agadir) */
function nextQuarter() {
  const t = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Casablanca" }).format(new Date());
  let m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  m = Math.min(Math.max(Math.ceil((m + 5) / 15) * 15, 8 * 60), 20 * 60 + 45);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function ExpressDesk({
  contacts,
  entities,
  items,
  staff,
  busy,
  defaultEntity,
  today,
  initialContactId,
}: {
  contacts: DeskContact[];
  entities: DeskEntity[];
  items: DeskItem[];
  staff: DeskStaff[];
  busy: DeskBusy[];
  defaultEntity: EntityId;
  today: string;
  initialContactId: string | null;
}) {
  /* ---------- 1. Client ---------- */
  const [query, setQuery] = useState("");
  const [contactId, setContactId] = useState<string | null>(initialContactId && contacts.some((c) => c.id === initialContactId) ? initialContactId : null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [hi, setHi] = useState(0);
  const [extra, setExtra] = useState<DeskContact[]>([]);
  const known = useMemo(() => [...extra, ...contacts], [extra, contacts]);
  const contact = known.find((c) => c.id === contactId) ?? null;

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const nq = norm(q);
    return contacts
      .filter((c) => matchesQuery(q, c.full_name, c.phone))
      .sort((a, b) => Number(norm(b.full_name).startsWith(nq)) - Number(norm(a.full_name).startsWith(nq)) || a.full_name.localeCompare(b.full_name, "fr"))
      .slice(0, 6);
  }, [contacts, query]);

  /* Doublons pendant la création : même numéro, ou nom très proche */
  const dupPhone = useMemo(() => {
    const d = phoneKey(newPhone);
    return d.length >= 9 ? (contacts.find((c) => phoneKey(c.phone) === d) ?? null) : null;
  }, [contacts, newPhone]);
  const dupNames = useMemo(() => {
    const n = norm(newName);
    if (n.length < 3) return [];
    return contacts.filter((c) => c.id !== dupPhone?.id && (norm(c.full_name) === n || norm(c.full_name).includes(n))).slice(0, 3);
  }, [contacts, newName, dupPhone]);

  /* ---------- 2. Choix ---------- */
  const [entityId, setEntityId] = useState<EntityId>(defaultEntity);
  const ent = entities.find((e) => e.id === entityId) ?? entities[0]!;
  const defaultMode = (e: DeskEntity): ExpressMode => (e.kind === "sport" ? "abonnement" : "rdv");
  const [mode, setMode] = useState<ExpressMode>(defaultMode(ent));
  const [itemQuery, setItemQuery] = useState("");
  const [itemHi, setItemHi] = useState(0);
  const [cart, setCart] = useState<{ id: string; qty: number }[]>([]);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(nextQuarter);
  const [staffId, setStaffId] = useState("");

  const entItems = useMemo(() => {
    const kinds = MODES.find((m) => m.id === mode)!.kinds;
    return items.filter((i) => i.entity_id === entityId && kinds.includes(i.kind) && matchesQuery(itemQuery, i.name, i.category));
  }, [items, entityId, mode, itemQuery]);
  const modeCount = (m: ExpressMode) => items.filter((i) => i.entity_id === entityId && MODES.find((x) => x.id === m)!.kinds.includes(i.kind)).length;
  const entStaff = useMemo(() => staff.filter((s) => !s.entity_ids.length || s.entity_ids.includes(entityId)), [staff, entityId]);
  const chosen = cart.map((l) => ({ ...l, item: items.find((i) => i.id === l.id)! })).filter((l) => l.item);
  const main = chosen[0]?.item ?? null;

  const pickItem = (it: DeskItem) => {
    if (mode === "produit") {
      setCart((c) => (c.some((l) => l.id === it.id) ? c.map((l) => (l.id === it.id ? { ...l, qty: Math.min(99, l.qty + 1) } : l)) : [...c, { id: it.id, qty: 1 }]));
    } else setCart([{ id: it.id, qty: 1 }]);
  };
  const changeEntity = (id: EntityId) => {
    setEntityId(id);
    const e = entities.find((x) => x.id === id);
    if (e) setMode(defaultMode(e));
    setCart([]);
    setStaffId("");
    setItemQuery("");
  };
  const changeMode = (m: ExpressMode) => {
    setMode(m);
    setCart([]);
    setItemHi(0);
  };

  const conflict = useMemo(() => {
    if (mode !== "rdv" || !staffId || !main || !/^\d{2}:\d{2}$/.test(time)) return null;
    const s = new Date(agadirToIso(date, time)).getTime();
    const e = s + (main.duration_min ?? 60) * 60000;
    return busy.find((b) => b.staff_id === staffId && new Date(b.starts_at).getTime() < e && s < new Date(b.starts_at).getTime() + b.duration_min * 60000) ?? null;
  }, [mode, staffId, main, date, time, busy]);

  /* ---------- 3. Paiement ---------- */
  const total = chosen.reduce((s, l) => s + l.item.price_mad * (mode === "produit" ? l.qty : 1), 0);
  const [method, setMethod] = useState<PayMethod>("especes");
  const [paidStr, setPaidStr] = useState<string | null>(null);
  const paid = paidStr === null ? total : Math.min(total, Math.max(0, Number(paidStr.replace(",", ".").replace(/\s/g, "")) || 0));
  const rest = Math.max(0, total - paid);

  /* ---------- Validation ---------- */
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; full_name: string; phone: string | null } | null>(null);
  const [pending, start] = useTransition();
  const missing = !contact && !(creating && newName.trim().length >= 2 && digits(newPhone).length >= 9)
    ? "Choisissez ou créez le client"
    : !chosen.length
      ? mode === "rdv"
        ? "Choisissez la prestation"
        : mode === "abonnement"
          ? "Choisissez l'abonnement"
          : "Ajoutez un produit"
      : conflict
        ? "Le praticien est déjà pris à cette heure"
        : creating && dupPhone && !contact
          ? "Ce numéro existe déjà : utilisez la fiche"
          : null;

  const submit = () => {
    if (missing || pending) return;
    setError(null);
    setDuplicate(null);
    start(async () => {
      const r = await expressCheckout({
        entity_id: entityId,
        contact_id: contact?.id ?? null,
        new_name: contact ? null : newName,
        new_phone: contact ? null : newPhone,
        mode,
        lines: chosen.map((l) => ({ item_id: l.id, qty: mode === "produit" ? l.qty : 1 })),
        rdv: mode === "rdv" ? { date, time, staff_id: staffId || null } : null,
        method,
        paid,
      });
      if (r?.error) setError(r.error);
      if (r?.duplicate) {
        const d = r.duplicate;
        setDuplicate(d);
        if (!known.some((c) => c.id === d.id)) setExtra((x) => [...x, { id: d.id, full_name: d.full_name, phone: d.phone, entity_ids: [] }]);
      }
    });
  };

  /* ---------- Clavier ---------- */
  const clientRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);
  const paidRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      } else if (e.altKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        (e.key === "1" ? clientRef : e.key === "2" ? itemRef : paidRef).current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectContact = (c: { id: string }) => {
    setContactId(c.id);
    setCreating(false);
    setQuery("");
    setDuplicate(null);
    setError(null);
    const full = known.find((x) => x.id === c.id);
    // Établissement du client si l'actuel ne lui correspond pas (et rien n'est encore choisi)
    if (full && !full.entity_ids.includes(entityId) && !cart.length) {
      const e = entities.find((x) => full.entity_ids.includes(x.id));
      if (e) changeEntity(e.id);
    }
    setTimeout(() => itemRef.current?.focus(), 0);
  };
  const startCreate = () => {
    const q = query.trim();
    const isPhone = digits(q).length >= 6 && /^[\d\s+().-]+$/.test(q);
    setCreating(true);
    setNewName(isPhone ? "" : q);
    setNewPhone(isPhone ? q : "");
    setQuery("");
  };

  const onClientKey = (e: React.KeyboardEvent) => {
    const n = results.length + (query.trim().length >= 2 ? 1 : 0);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHi((h) => (n ? (h + step + n) % n : 0));
    } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (hi < results.length && results[hi]) selectContact(results[hi]);
      else if (query.trim().length >= 2) startCreate();
    }
  };
  const onItemKey = (e: React.KeyboardEvent) => {
    const n = entItems.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setItemHi((h) => (n ? (h + step + n) % n : 0));
    } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && entItems[itemHi]) {
      e.preventDefault();
      pickItem(entItems[itemHi]!);
    }
  };

  const itemMeta = (i: DeskItem) =>
    i.kind === "prestation"
      ? `${i.duration_min ?? 60} min`
      : i.kind === "pack"
        ? `${i.sessions_count ?? 1} séances`
        : i.kind === "abonnement"
          ? `${i.duration_days ?? 30} jours`
          : i.stock !== null
            ? `${i.stock} en stock`
            : i.category;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_340px] [&>*]:min-w-0">
      {/* 1. Client */}
      <Step n={1} title="Client" kbd="Alt 1">
        {contact ? (
          <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
            <Avatar name={contact.full_name} size={36} />
            <div className="min-w-0 flex-1">
              <ContactLink id={contact.id} name={contact.full_name} className="block truncate text-sm" />
              <p className="truncate text-xs text-muted">{contact.phone ?? "Sans téléphone"}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setContactId(null);
                setTimeout(() => clientRef.current?.focus(), 0);
              }}
              className={buttonClass("ghost", "px-2.5")}
            >
              Changer
            </button>
          </div>
        ) : creating ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
                <UserPlus className="size-4 text-slate-400" /> Nouveau client
              </p>
              <button type="button" onClick={() => {
                  setCreating(false);
                  setTimeout(() => clientRef.current?.focus(), 0);
                }} className="text-[13px] font-medium text-brand-600 hover:underline">
                Rechercher plutôt
              </button>
            </div>
            <Field label="Nom complet">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex. Salma Bennani" autoFocus={!newName} autoComplete="off" />
            </Field>
            <Field label="Téléphone">
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="06 12 34 56 78" inputMode="tel" autoFocus={!!newName} autoComplete="off" />
            </Field>
            {dupPhone && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
                <p className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Ce numéro appartient déjà à <b className="font-semibold">{dupPhone.full_name}</b>.
                  </span>
                </p>
                <button type="button" onClick={() => selectContact(dupPhone)} className={buttonClass("secondary", "mt-2 h-8")}>
                  <Check /> Utiliser cette fiche
                </button>
              </div>
            )}
            {dupNames.length > 0 && (
              <div className="text-[13px]">
                <p className="text-xs text-muted">Déjà enregistré ?</p>
                <ul className="mt-1 space-y-1">
                  {dupNames.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => selectContact(c)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50">
                        <UserRound className="size-3.5 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.full_name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted">{c.phone ?? "—"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                ref={clientRef}
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHi(0);
                }}
                onKeyDown={onClientKey}
                placeholder="Nom ou téléphone…"
                aria-label="Rechercher le client par nom ou téléphone"
                className="pl-9"
                autoComplete="off"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="express-clients"
              />
            </div>
            {query.trim().length >= 2 ? (
              <ul id="express-clients" role="listbox" className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
                {results.map((c, i) => (
                  <li key={c.id} role="option" aria-selected={i === hi}>
                    <button type="button" onMouseEnter={() => setHi(i)} onClick={() => selectContact(c)} className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left", i === hi ? "bg-brand-50/60" : "hover:bg-slate-50")}>
                      <Avatar name={c.full_name} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{c.full_name}</span>
                        <span className="block truncate text-xs tabular-nums text-muted">{c.phone ?? "Sans téléphone"}</span>
                      </span>
                      {i === hi && <Kbd>Entrée</Kbd>}
                    </button>
                  </li>
                ))}
                <li role="option" aria-selected={hi === results.length}>
                  <button
                    type="button"
                    onMouseEnter={() => setHi(results.length)}
                    onClick={startCreate}
                    className={cn("flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-brand-700", hi === results.length ? "bg-brand-50/60" : "hover:bg-slate-50")}
                  >
                    <UserPlus className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">Créer « {query.trim()} »</span>
                    {hi === results.length && <Kbd>Entrée</Kbd>}
                  </button>
                </li>
              </ul>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
                <span>Tapez au moins 2 lettres ou chiffres.</span>
                <button type="button" onClick={() => {
                    setCreating(true);
                    setNewName("");
                    setNewPhone("");
                  }} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                  <UserPlus className="size-3.5" /> Nouveau client
                </button>
              </div>
            )}
          </div>
        )}
      </Step>

      {/* 2. Choix */}
      <Step n={2} title="Ce qu'il veut" kbd="Alt 2">
        {entities.length > 1 && (
          <div className="-mx-1 mb-3 overflow-x-auto px-1">
            <div className="inline-flex gap-1" role="radiogroup" aria-label="Établissement">
              {entities.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={e.id === entityId}
                  onClick={() => changeEntity(e.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[13px] font-medium transition",
                    e.id === entityId ? "border-brand-300 bg-brand-50 text-ink" : "border-line text-slate-500 hover:text-ink",
                  )}
                >
                  <span className="size-2 rounded-full" style={{ background: e.color }} />
                  {e.short}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="inline-flex w-full gap-0.5 rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Type">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => changeMode(m.id)}
              className={cn("inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md px-2 text-[13px] font-medium transition", mode === m.id ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink")}
            >
              {m.label}
              <span className="text-xs tabular-nums text-slate-400">{modeCount(m.id)}</span>
            </button>
          ))}
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={itemRef}
            value={itemQuery}
            onChange={(e) => {
              setItemQuery(e.target.value);
              setItemHi(0);
            }}
            onKeyDown={onItemKey}
            placeholder={`Chercher ${mode === "rdv" ? "une prestation" : mode === "abonnement" ? "un abonnement" : "un produit"}…`}
            aria-label="Chercher dans le catalogue"
            className="h-9 pl-9 text-[13px]"
            autoComplete="off"
          />
        </div>
        {entItems.length === 0 ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-center text-[13px] text-muted">
            {itemQuery ? "Aucun article ne correspond." : `Aucun ${mode === "rdv" ? "soin ou prestation" : mode === "abonnement" ? "abonnement" : "produit"} au catalogue de ${ent.short}.`}
          </p>
        ) : (
          <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line" role="listbox" aria-label="Catalogue">
            {entItems.map((i, idx) => {
              const inCart = cart.find((l) => l.id === i.id);
              const out = i.kind === "produit" && i.stock !== null && i.stock <= 0;
              return (
                <li key={i.id} role="option" aria-selected={!!inCart}>
                  <button
                    type="button"
                    disabled={out}
                    onMouseEnter={() => setItemHi(idx)}
                    onClick={() => pickItem(i)}
                    className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left disabled:opacity-50", inCart ? "bg-brand-50/70" : idx === itemHi ? "bg-slate-50" : "hover:bg-slate-50")}
                  >
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", inCart ? "border-brand-500 bg-brand-500 text-white" : "border-line")}>{inCart && <Check className="size-3" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{i.name}</span>
                      <span className="block truncate text-xs text-muted">{out ? "Rupture de stock" : itemMeta(i)}</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{mad(i.price_mad)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Rendez-vous : date, heure, praticien */}
        {mode === "rdv" && main && (
          <div className="mt-4 grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field label="Date">
              <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Heure">
              <Input type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Praticien" className="col-span-2">
              <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">Sans préférence</option>
                {entStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {s.job_title ? ` · ${s.job_title}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            {conflict && (
              <p className="col-span-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Déjà pris de {fmtTime(conflict.starts_at)} à {fmtTime(new Date(new Date(conflict.starts_at).getTime() + conflict.duration_min * 60000))} ({conflict.service}). Changez l&apos;heure ou le praticien.
              </p>
            )}
          </div>
        )}

        {/* Produits : quantités */}
        {mode === "produit" && chosen.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {chosen.map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-ink">{l.item.name}</span>
                <button type="button" aria-label="Retirer un" onClick={() => setCart((c) => c.flatMap((x) => (x.id === l.id ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x])))} className={buttonClass("secondary", "size-8 px-0")}>
                  <Minus />
                </button>
                <span className="w-6 text-center font-semibold tabular-nums">{l.qty}</span>
                <button type="button" aria-label="Ajouter un" onClick={() => pickItem(l.item)} className={buttonClass("secondary", "size-8 px-0")}>
                  <Plus />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Step>

      {/* 3. Paiement + récapitulatif */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Step n={3} title="Paiement" kbd="Alt 3">
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Mode de paiement">
            {PAY.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={cn("h-9 rounded-lg border text-[13px] font-medium transition", method === m ? "border-brand-400 bg-brand-50 text-ink" : "border-line text-slate-600 hover:bg-slate-50")}
              >
                {PAY_LABEL[m]}
              </button>
            ))}
          </div>
          <Field label="Montant encaissé (MAD)" className="mt-3">
            <Input
              ref={paidRef}
              inputMode="decimal"
              value={paidStr ?? String(total)}
              onChange={(e) => setPaidStr(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="text-base font-semibold tabular-nums"
            />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setPaidStr(null)} className={buttonClass(paidStr === null ? "brand" : "secondary", "h-8 px-2.5")}>
              Tout
            </button>
            {mode === "rdv" && (
              <button type="button" onClick={() => setPaidStr("0")} className={buttonClass(paidStr === "0" ? "brand" : "secondary", "h-8 px-2.5")}>
                Payer sur place
              </button>
            )}
            {total > 0 && (
              <button type="button" onClick={() => setPaidStr(String(Math.round(total / 2)))} className={buttonClass("secondary", "h-8 px-2.5")}>
                Acompte 50 %
              </button>
            )}
          </div>
        </Step>

        <section className="rounded-xl border border-line bg-white p-4" aria-label="Récapitulatif">
          <h2 className="text-sm font-semibold text-ink">Récapitulatif</h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <Row label="Client">
              {contact ? (
                <ContactLink id={contact.id} name={contact.full_name} />
              ) : creating && newName.trim() ? (
                <span className="font-medium text-ink">
                  {newName.trim()} <span className="text-xs font-normal text-brand-600">· nouveau</span>
                </span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </Row>
            <Row label="Établissement">
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                <span className="size-2 rounded-full" style={{ background: ent.color }} />
                {ent.short}
              </span>
            </Row>
            {chosen.length ? (
              chosen.map((l) => (
                <Row key={l.id} label={mode === "produit" ? `${l.qty} ×` : mode === "rdv" ? "Prestation" : "Formule"}>
                  <span className="font-medium text-ink">{l.item.name}</span>
                </Row>
              ))
            ) : (
              <Row label="Article">
                <span className="text-slate-400">—</span>
              </Row>
            )}
            {mode === "rdv" && main && (
              <Row label="Rendez-vous">
                <span className="inline-flex items-center gap-1 font-medium capitalize text-ink">
                  <CalendarClock className="size-3.5 text-slate-400" />
                  {date === today ? "Aujourd'hui" : new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))} · {time}
                </span>
              </Row>
            )}
          </dl>
          <div className="mt-3 space-y-1 border-t border-line pt-3 text-[13px]">
            <div className="flex items-baseline justify-between">
              <span className="text-muted">Total</span>
              <span className="text-xl font-semibold tabular-nums text-ink">{mad(total)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted">Encaissé ({PAY_LABEL[method].toLowerCase()})</span>
              <span className="font-semibold tabular-nums text-ink">{mad(paid)}</span>
            </div>
            {rest > 0 && (
              <div className="flex items-baseline justify-between text-amber-700">
                <span>{mode === "rdv" && paid === 0 ? "À régler le jour du rendez-vous" : "Reste à payer"}</span>
                <span className="font-semibold tabular-nums">{mad(rest)}</span>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
              <p className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
              {duplicate && (
                <button type="button" onClick={() => selectContact(duplicate)} className={buttonClass("secondary", "mt-2 h-8")}>
                  <Check /> Utiliser la fiche de {duplicate.full_name}
                </button>
              )}
            </div>
          )}

          <button type="button" onClick={submit} disabled={!!missing || pending} className={buttonClass("primary", "mt-4 h-11 w-full text-sm")}>
            {pending ? <Loader2 className="animate-spin" /> : mode === "rdv" && paid === 0 ? <CalendarClock /> : mode === "produit" ? <ShoppingBag /> : <Ticket />}
            {pending ? "Enregistrement…" : mode === "rdv" && paid === 0 ? "Valider le rendez-vous" : `Valider · ${mad(paid)}`}
          </button>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted">
            {missing ? (
              <>
                <X className="size-3.5" /> {missing}
              </>
            ) : (
              <>
                <Kbd>Ctrl</Kbd> + <Kbd>Entrée</Kbd> pour valider
              </>
            )}
          </p>
        </section>
      </div>
    </div>
  );
}

function Step({ n, title, kbd, children }: { n: number; title: string; kbd: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4" aria-label={title}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold tabular-nums text-slate-600">{n}</span>
        <h2 className="flex-1 text-sm font-semibold text-ink">{title}</h2>
        <span className="hidden lg:inline">
          <Kbd>{kbd}</Kbd>
        </span>
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}
