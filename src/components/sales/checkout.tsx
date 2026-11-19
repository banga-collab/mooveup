"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownUp,
  Barcode,
  Lock,
  Minus,
  PackageX,
  Pause,
  Percent,
  Play,
  Plus,
  ReceiptText,
  Search,
  ShoppingBasket,
  ShoppingCart,
  Trash2,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import { addCashMove, createSale, openRegister, type CheckoutInput } from "@/actions/sales";
import { ContactPicker, type PickerContact } from "@/components/contact-picker";
import { buttonClass } from "@/components/ui";
import { cn, fmtTime, mad } from "@/lib/utils";
import { KIND_META, itemDetail } from "./meta";
import { CashMoveDialog, ErrorLine, Modal, OpenRegister, PaymentDialog, TicketDialog } from "./pos-dialogs";
import type { CartLine, PosCashMove, PosEntity, PosItem, PosPayment, PosSession, TicketData } from "./pos-types";

export type { CartLine } from "./pos-types";

type Line = CartLine & { priceText: string; showDisc?: boolean };
type Held = { id: string; at: string; entity_id: string; lines: Line[]; contact: PickerContact | null; discMode: "mad" | "pct"; discText: string };

const HELD_KEY = "moovup-pos-held";
const toNum = (s: string) => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const withText = (l: CartLine): Line => ({ ...l, priceText: String(l.unit_price) });
const lineTotal = (l: CartLine) => r2(l.qty * l.unit_price * (1 - Math.min(100, Math.max(0, l.disc_pct ?? 0)) / 100));
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const field =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 transition focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15";
const segBtn = (on: boolean) =>
  cn(
    "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
    on ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink",
  );
const kbd = "rounded border border-line px-1 text-[10px] font-medium text-muted";
const DISC = [5, 10, 15, 20];

function readHeld(): Held[] {
  try {
    const raw = window.localStorage.getItem(HELD_KEY);
    const v = raw ? (JSON.parse(raw) as Held[]) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writeHeld(v: Held[]) {
  try {
    window.localStorage.setItem(HELD_KEY, JSON.stringify(v));
  } catch {
    /* stockage indisponible : les paniers restent en mémoire */
  }
}

export function Checkout({
  entities,
  initialEntity,
  items,
  contacts,
  initialContact,
  initialLines,
  rdvId,
  todaySales,
  sessions,
  moves,
  canOpen,
  lastFloat,
}: {
  entities: PosEntity[];
  initialEntity: string;
  items: PosItem[];
  contacts: PickerContact[];
  initialContact: string | null;
  initialLines: CartLine[];
  rdvId: string | null;
  todaySales: { entity_id: string; total: number; paid: number }[];
  sessions: PosSession[];
  moves: PosCashMove[];
  canOpen: boolean;
  lastFloat: Record<string, number>;
}) {
  const router = useRouter();
  const [entityId, setEntityId] = useState(initialEntity);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [lines, setLines] = useState<Line[]>(() => initialLines.map(withText));
  const [contact, setContact] = useState<PickerContact | null>(() => contacts.find((c) => c.id === initialContact) ?? null);
  const [contactKey, setContactKey] = useState(0);
  const [discMode, setDiscMode] = useState<"mad" | "pct">("mad");
  const [discText, setDiscText] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [showMoves, setShowMoves] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [held, setHeld] = useState<Held[]>([]);
  const [undo, setUndo] = useState<Held | null>(null);
  const [shortOk, setShortOk] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const ent = entities.find((e) => e.id === entityId) ?? entities[0]!;
  const session = sessions.find((s) => s.entity_id === entityId) ?? null;
  const isOpen = session?.status === "ouverte";
  const entityMoves = moves.filter((m) => m.entity_id === entityId);

  useEffect(() => {
    setHeld(readHeld());
  }, []);

  /* ----- Catalogue de l'établissement ----- */
  const entityItems = useMemo(() => items.filter((i) => i.entity_id === entityId), [items, entityId]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const byBarcode = useMemo(() => new Map(entityItems.filter((i) => i.barcode).map((i) => [i.barcode!, i])), [entityItems]);
  const categories = useMemo(() => [...new Set(entityItems.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [entityItems]);
  const shown = useMemo(() => {
    const n = norm(q.trim());
    const order = ["abonnement", "pack", "prestation", "produit"];
    return entityItems
      .filter((i) => (cat === "all" || i.category === cat) && (!n || norm(i.name).includes(n) || norm(i.category).includes(n) || (i.barcode ?? "").startsWith(n)))
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name, "fr"));
  }, [entityItems, cat, q]);
  const lowCount = entityItems.filter((i) => i.kind === "produit" && i.stock !== null && i.stock <= i.alert).length;

  /* ----- Stats du jour ----- */
  const stats = useMemo(() => {
    const s = todaySales.filter((x) => x.entity_id === entityId);
    return { paid: s.reduce((a, x) => a + x.paid, 0), count: s.length };
  }, [todaySales, entityId]);

  /* ----- Panier ----- */
  const gross = r2(lines.reduce((a, l) => a + lineTotal(l), 0));
  const dv = Math.max(0, toNum(discText));
  const discount = Math.min(gross, discMode === "pct" ? (gross * Math.min(dv, 100)) / 100 : dv);
  const total = r2(gross - discount);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const needsContact = lines.some((l) => l.kind === "abonnement" || l.kind === "pack");

  const inCartBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) if (l.item_id) m.set(l.item_id, (m.get(l.item_id) ?? 0) + l.qty);
    return m;
  }, [lines]);

  /** Vérifie le stock avant d'ajouter `extra` unité(s) : confirmation si insuffisant */
  const stockOk = (it: PosItem | undefined, extra: number) => {
    if (!it || it.kind !== "produit" || it.stock === null) return true;
    const need = (inCartBy.get(it.id) ?? 0) + extra;
    if (need <= it.stock || shortOk.has(it.id)) return true;
    const ok = window.confirm(
      it.stock <= 0
        ? `« ${it.name} » est en rupture de stock. Vendre quand même ?`
        : `Stock insuffisant pour « ${it.name} » : ${it.stock} disponible${it.stock > 1 ? "s" : ""}. Vendre quand même ?`,
    );
    if (ok) setShortOk((s) => new Set(s).add(it.id));
    return ok;
  };

  const add = (it: PosItem) => {
    setError(null);
    if (!stockOk(it, 1)) return;
    setLines((ls) => {
      const ex = ls.find((l) => l.item_id === it.id && !(l.disc_pct ?? 0));
      if (ex) return ls.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, withText({ key: `${it.id}-${Date.now()}`, item_id: it.id, label: it.name, kind: it.kind, qty: 1, unit_price: it.price, disc_pct: 0 })];
    });
  };
  const addFree = () => setLines((ls) => [...ls, withText({ key: `libre-${Date.now()}`, item_id: null, label: "", kind: null, qty: 1, unit_price: 0, disc_pct: 0 })]);
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const bump = (key: string, d: number) => {
    const l = lines.find((x) => x.key === key);
    if (d > 0 && l?.item_id && !stockOk(itemById.get(l.item_id), d)) return;
    setLines((ls) => ls.flatMap((x) => (x.key !== key ? [x] : x.qty + d <= 0 ? [] : [{ ...x, qty: x.qty + d }])));
  };

  const snapshot = (): Held => ({ id: `h${Date.now()}`, at: new Date().toISOString(), entity_id: entityId, lines, contact, discMode, discText });
  const reset = () => {
    setLines([]);
    setDiscText("");
    setNotes("");
    setContact(null);
    setContactKey((k) => k + 1);
    setError(null);
    setShortOk(new Set());
  };
  const restore = (h: Held) => {
    setEntityId(h.entity_id);
    setLines(h.lines);
    setContact(h.contact);
    setContactKey((k) => k + 1);
    setDiscMode(h.discMode);
    setDiscText(h.discText);
  };

  /** Annuler la vente en cours (Échap) : rétablissable pendant 6 s */
  const cancel = () => {
    if (!lines.length) return;
    setUndo(snapshot());
    reset();
  };
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  const hold = () => {
    if (!lines.length) return;
    const next = [snapshot(), ...held].slice(0, 12);
    setHeld(next);
    writeHeld(next);
    reset();
    setNotice("Panier mis en attente");
  };
  const resume = (h: Held) => {
    let next = held.filter((x) => x.id !== h.id);
    if (lines.length) next = [snapshot(), ...next];
    setHeld(next);
    writeHeld(next);
    restore(h);
    setShowHeld(false);
  };
  const dropHeld = (id: string) => {
    const next = held.filter((x) => x.id !== id);
    setHeld(next);
    writeHeld(next);
  };

  const switchEntity = (id: string) => {
    if (id === entityId) return;
    if (lines.length) {
      const next = [snapshot(), ...held].slice(0, 12);
      setHeld(next);
      writeHeld(next);
      setNotice(`Panier de ${ent.short} mis en attente`);
    }
    reset();
    setCat("all");
    setEntityId(id);
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const openPayment = () => {
    setError(null);
    if (!lines.length) return setError("Ajoutez au moins un article au panier.");
    if (lines.some((l) => !l.label.trim())) return setError("Donnez un nom à chaque ligne libre.");
    setPayError(null);
    setPaying(true);
  };

  const done = (t: TicketData) => {
    setPaying(false);
    setTicket(t);
    reset();
    router.refresh();
  };

  const submit = (payments: PosPayment[], credit: boolean) => {
    setPayError(null);
    const payload: CheckoutInput = {
      entity_id: entityId,
      contact_id: contact?.id ?? null,
      lines: lines.map((l) => {
        const d = Math.min(100, Math.max(0, l.disc_pct ?? 0));
        return { item_id: l.item_id, label: l.label.trim() + (d ? ` (remise ${d} %)` : ""), qty: l.qty, unit_price: r2(l.unit_price * (1 - d / 100)) };
      }),
      discount_mode: discMode,
      discount_value: dv,
      method: payments[0]?.method ?? "especes",
      paid: payments.length ? null : 0,
      payments: payments.length ? payments : undefined,
      rdv_id: rdvId,
      notes: [notes.trim(), credit ? "Reste dû" : ""].filter(Boolean).join(" · ") || null,
      check_stock: true,
      allow_short: shortOk.size > 0,
      stay: true,
    };
    startTransition(async () => {
      const r = await createSale(payload);
      if (r?.short?.length) {
        if (!window.confirm(`${r.error}\n\nVendre quand même ?`)) return setPayError(r.error ?? null);
        const again = await createSale({ ...payload, allow_short: true });
        if (again.error) return setPayError(again.error);
        if (again.ticket) done(again.ticket);
        return;
      }
      if (r?.error) return setPayError(r.error);
      if (r?.ticket) done(r.ticket);
    });
  };

  /* ----- Lecteur de codes-barres ----- */
  const scan = (code: string) => {
    const it = byBarcode.get(code.trim());
    if (it) {
      add(it);
      setNotice(`${it.name} ajouté`);
      return;
    }
    setError(`Code-barres inconnu chez ${ent.short} : ${code}`);
  };

  /* ----- Raccourcis clavier (F2, F8, F9, Échap) + scan hors champ de saisie ----- */
  const handlers = useRef({ openPayment, hold, cancel, scan });
  useEffect(() => {
    handlers.current = { openPayment, hold, cancel, scan };
  });
  const blocked = paying || !!ticket || showMoves || showHeld || !isOpen;
  const buffer = useRef({ text: "", last: 0 });
  useEffect(() => {
    if (blocked) return;
    const onKey = (e: KeyboardEvent) => {
      const h = handlers.current;
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        h.openPayment();
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        h.hold();
        return;
      }
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "Escape" && !typing) {
        e.preventDefault();
        h.cancel();
        return;
      }
      if (typing) return;
      // Saisie très rapide terminée par Entrée = lecteur de codes-barres
      const now = Date.now();
      const b = buffer.current;
      if (now - b.last > 80) b.text = "";
      b.last = now;
      if (e.key === "Enter" && b.text.length >= 4) {
        e.preventDefault();
        const code = b.text;
        b.text = "";
        h.scan(code);
      } else if (e.key.length === 1 && /[0-9A-Za-z-]/.test(e.key)) b.text += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocked]);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (q) setQ("");
      else e.currentTarget.blur();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    const exact = byBarcode.get(v);
    if (exact) {
      add(exact);
      setQ("");
    } else if (/^\d{6,}$/.test(v)) {
      scan(v);
      setQ("");
    } else if (shown.length === 1) {
      add(shown[0]!);
      setQ("");
    }
  };

  /* ----- Rendu ----- */
  const header = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {entities.length > 1 && (
          <div className="-mx-1 max-w-full overflow-x-auto px-1">
            <div className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Établissement">
              {entities.map((e) => {
                const s = sessions.find((x) => x.entity_id === e.id);
                return (
                  <button key={e.id} type="button" role="tab" aria-selected={e.id === entityId} onClick={() => switchEntity(e.id)} className={segBtn(e.id === entityId)}>
                    <span className="size-2 rounded-full" style={{ background: e.color }} />
                    {e.short}
                    {s?.status !== "ouverte" && <Lock className="size-3 text-slate-400" aria-label="Caisse fermée" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {isOpen && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            <span className="size-2 rounded-full bg-emerald-500" /> Ouverte à {fmtTime(session!.opened_at)} · fond {mad(session!.float)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isOpen && (
          <>
            <span className="mr-1 text-[13px] text-muted">
              <span className="font-semibold tabular-nums text-ink">{mad(stats.paid)}</span> · {stats.count} ticket{stats.count > 1 ? "s" : ""}
            </span>
            <button type="button" onClick={() => setShowHeld(true)} className={buttonClass("secondary", "h-9 px-3")} disabled={!held.length}>
              <Play /> En attente{held.length ? ` (${held.length})` : ""}
            </button>
            {canOpen && (
              <button type="button" onClick={() => setShowMoves(true)} className={buttonClass("secondary", "h-9 px-3")}>
                <ArrowDownUp /> Entrée / sortie
              </button>
            )}
          </>
        )}
        {canOpen && (
          <Link href={`/cloture?caisse=${entityId}`} className={buttonClass("secondary", "h-9 px-3")}>
            <ReceiptText /> Clôture (Z)
          </Link>
        )}
      </div>
    </div>
  );

  if (!isOpen) {
    return (
      <div className="space-y-5">
        {header}
        {session?.status === "cloturee" ? (
          <div className="mx-auto max-w-md rounded-xl border border-line bg-white p-6 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-400">
              <Lock className="size-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">Caisse de {ent.short} clôturée</p>
            <p className="mt-1 text-[13px] text-muted">Clôturée à {session.closed_at ? fmtTime(session.closed_at) : "–"}. Les ventes reprendront à l&apos;ouverture de demain.</p>
            <Link href={`/cloture?caisse=${entityId}`} className={buttonClass("secondary", "mt-4")}>
              <ReceiptText /> Voir le Z de caisse
            </Link>
          </div>
        ) : (
          <OpenRegister
            key={entityId}
            entityShort={ent.short}
            defaultFloat={lastFloat[entityId] ?? 500}
            canOpen={canOpen}
            onOpen={async (float) => {
              const r = await openRegister(entityId, float);
              if (r.error) return r.error;
              router.refresh();
              return null;
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px] [&>*]:min-w-0">
        {/* ----- Catalogue ----- */}
        <section className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={`Rechercher ou scanner chez ${ent.short}…`}
              aria-label="Rechercher un article ou scanner un code-barres"
              className={cn(field, "h-11 pl-9 pr-24")}
              autoComplete="off"
            />
            <span className="pointer-events-none absolute right-11 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[11px] text-muted sm:inline-flex">
              <Barcode className="size-3.5" /> F2
            </span>
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute right-0.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:text-ink" aria-label="Effacer la recherche">
                <X className="size-4" />
              </button>
            )}
          </div>

          {categories.length > 1 && (
            <div className="-mx-1 overflow-x-auto px-1">
              <div className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
                {["all", ...categories].map((c) => (
                  <button key={c} type="button" onClick={() => setCat(c)} className={segBtn(c === cat)} aria-pressed={c === cat}>
                    {c === "all" ? "Tout" : c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {lowCount > 0 && cat === "all" && !q && (
            <p className="flex items-center gap-2 text-[13px] text-accent-700">
              <AlertTriangle className="size-4 shrink-0" /> {lowCount} produit{lowCount > 1 ? "s" : ""} en stock bas ·
              <Link href="/stock?etat=commander" className="font-medium underline-offset-2 hover:underline">
                voir le stock
              </Link>
            </p>
          )}

          {shown.length ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 [&>*]:min-w-0">
              {shown.map((it) => {
                const I = KIND_META[it.kind].icon;
                const inCart = inCartBy.get(it.id) ?? 0;
                const tracked = it.kind === "produit" && it.stock !== null;
                const left = tracked ? it.stock! - inCart : 0;
                const out = tracked && left <= 0;
                const low = tracked && !out && left <= it.alert;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => add(it)}
                    aria-label={`Ajouter ${it.name}, ${mad(it.price)}${tracked ? `, ${Math.max(0, left)} en stock` : ""}`}
                    className={cn(
                      "relative flex min-h-[112px] flex-col rounded-xl border bg-white p-3 text-left transition active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                      inCart ? "border-brand-500" : "border-line hover:border-slate-300",
                      out && !inCart && "opacity-60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <I className="size-4 shrink-0 text-slate-400" />
                      {inCart > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold tabular-nums text-white">{inCart}</span>}
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-ink">{it.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">{it.kind === "produit" ? it.category : itemDetail(it) || it.category}</p>
                    <div className="mt-auto flex items-end justify-between gap-1 pt-2">
                      <span className="text-sm font-semibold tabular-nums text-ink">{mad(it.price)}</span>
                      {out ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                          <PackageX className="size-3" /> Rupture
                        </span>
                      ) : low ? (
                        <span className="text-[11px] font-medium tabular-nums text-accent-700">Stock bas · {left}</span>
                      ) : tracked ? (
                        <span className="text-[11px] tabular-nums text-muted">Stock {left}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center">
              <span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-400">
                <Search className="size-5" />
              </span>
              <p className="mt-3 text-sm font-medium text-ink">Aucun article trouvé</p>
              <p className="mt-1 max-w-sm text-[13px] text-muted">{entityItems.length ? "Essayez une autre recherche, un code-barres ou une autre catégorie." : "Ajoutez des articles au catalogue de cet établissement."}</p>
            </div>
          )}
        </section>

        {/* ----- Panier ----- */}
        <aside id="panier" className="scroll-mt-20 lg:sticky lg:top-6">
          <div className="rounded-xl border border-line bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Panier</p>
                <p className="truncate text-xs text-muted">
                  {ent.short} · <span className="tabular-nums">{count}</span> article{count > 1 ? "s" : ""}
                </p>
              </div>
              {lines.length > 0 && (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={hold} className={buttonClass("ghost", "h-8 px-2.5 text-xs")} title="Mettre en attente (F9)">
                    <Pause /> Attente
                  </button>
                  <button type="button" onClick={cancel} className={buttonClass("ghost", "h-8 px-2.5 text-xs")} title="Annuler la vente (Échap)">
                    <Trash2 /> Annuler
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-5 p-5">
              {lines.length ? (
                <ul className="-mt-2 divide-y divide-line">
                  {lines.map((l) => {
                    const it = l.item_id ? itemById.get(l.item_id) : undefined;
                    const over = !!it && it.kind === "produit" && it.stock !== null && (inCartBy.get(it.id) ?? 0) > it.stock;
                    return (
                      <li key={l.key} className="py-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            {l.item_id ? (
                              <p className="text-[13px] font-medium leading-snug text-ink">{l.label}</p>
                            ) : (
                              <input value={l.label} onChange={(e) => patch(l.key, { label: e.target.value })} placeholder="Libellé de la ligne" aria-label="Libellé de la ligne libre" className={cn(field, "h-9 text-[13px]")} />
                            )}
                            {over && (
                              <p className="mt-0.5 text-[11px] font-medium text-accent-700">
                                Stock insuffisant ({Math.max(0, it!.stock!)} disponible{it!.stock! > 1 ? "s" : ""})
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <div className="inline-flex items-center rounded-lg border border-line">
                                <button type="button" onClick={() => bump(l.key, -1)} className="grid size-9 place-items-center rounded-l-lg text-slate-500 hover:bg-slate-50" aria-label="Diminuer la quantité">
                                  <Minus className="size-3.5" />
                                </button>
                                <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                                <button type="button" onClick={() => bump(l.key, 1)} className="grid size-9 place-items-center rounded-r-lg text-slate-500 hover:bg-slate-50" aria-label="Augmenter la quantité">
                                  <Plus className="size-3.5" />
                                </button>
                              </div>
                              <span className="text-xs text-muted">×</span>
                              <span className="relative">
                                <input
                                  value={l.priceText}
                                  inputMode="decimal"
                                  onChange={(e) => patch(l.key, { priceText: e.target.value, unit_price: Math.max(0, toNum(e.target.value)) })}
                                  className="h-9 w-[88px] rounded-lg border border-line pl-2 pr-9 text-right text-[13px] tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                                  aria-label="Prix unitaire"
                                />
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">MAD</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => patch(l.key, { showDisc: !l.showDisc })}
                                className={cn("grid size-9 place-items-center rounded-lg border hover:text-ink", l.disc_pct ? "border-brand-500 text-brand-600" : "border-line text-slate-400")}
                                aria-label="Remise sur la ligne"
                                aria-expanded={!!l.showDisc}
                              >
                                <Percent className="size-3.5" />
                              </button>
                              <span className="ml-auto text-right">
                                {!!l.disc_pct && <span className="block text-[11px] tabular-nums text-muted line-through">{mad(l.qty * l.unit_price)}</span>}
                                <span className="text-sm font-semibold tabular-nums text-ink">{mad(lineTotal(l))}</span>
                              </span>
                            </div>
                            {l.showDisc && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted">Remise</span>
                                {DISC.map((p) => (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => patch(l.key, { disc_pct: l.disc_pct === p ? 0 : p })}
                                    className={cn("h-8 rounded-md border px-2 text-xs font-medium tabular-nums", l.disc_pct === p ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-slate-600")}
                                  >
                                    {p} %
                                  </button>
                                ))}
                                <input
                                  defaultValue={l.disc_pct && !DISC.includes(l.disc_pct) ? String(l.disc_pct) : ""}
                                  inputMode="decimal"
                                  placeholder="%"
                                  aria-label="Remise de la ligne en %"
                                  onChange={(e) => patch(l.key, { disc_pct: Math.min(100, Math.max(0, toNum(e.target.value))) })}
                                  className="h-8 w-14 rounded-md border border-line px-2 text-right text-xs tabular-nums focus:border-brand-400 focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                          <button type="button" onClick={() => bump(l.key, -l.qty)} className="-mr-2 -mt-1.5 grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Retirer ${l.label || "la ligne"}`}>
                            <X className="size-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-4 py-7 text-center">
                  <ShoppingBasket className="size-6 text-slate-300" />
                  <p className="mt-2 text-[13px] font-medium text-slate-600">Panier vide</p>
                  <p className="text-xs text-muted">Touchez un article ou scannez un code-barres.</p>
                </div>
              )}
              <button type="button" onClick={addFree} className="-mt-2 inline-flex h-9 items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline">
                <Plus className="size-3.5" /> Ligne libre
              </button>

              {/* Client */}
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-slate-700">
                  Client <span className="font-normal text-muted">(facultatif)</span>
                </p>
                <ContactPicker key={contactKey} contacts={contacts} name="contact_id" defaultId={contact?.id ?? null} onChange={setContact} />
                {needsContact && !contact && <p className="mt-1.5 text-xs text-accent-700">Choisissez le client pour activer l&apos;abonnement ou le pack.</p>}
              </div>

              {/* Remise globale */}
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-slate-700">Remise sur le ticket</p>
                <div className="flex gap-2">
                  <div className="inline-flex shrink-0 gap-0.5 rounded-lg bg-slate-100 p-0.5">
                    {(["mad", "pct"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setDiscMode(m)} className={segBtn(discMode === m)} aria-pressed={discMode === m}>
                        {m === "mad" ? "MAD" : "%"}
                      </button>
                    ))}
                  </div>
                  <input value={discText} onChange={(e) => setDiscText(e.target.value)} inputMode="decimal" placeholder="0" className={cn(field, "min-w-0 flex-1 tabular-nums")} aria-label="Montant de la remise" />
                </div>
              </div>

              {/* Totaux */}
              <dl className="space-y-1.5 border-t border-line pt-4 text-sm">
                <div className="flex justify-between text-slate-600">
                  <dt>Sous-total</dt>
                  <dd className="tabular-nums">{mad(gross)}</dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <dt>Remise{discMode === "pct" ? ` (${Math.min(dv, 100)} %)` : ""}</dt>
                    <dd className="tabular-nums">− {mad(discount)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-1">
                  <dt className="font-medium text-ink">Total</dt>
                  <dd className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-ink">{mad(total)}</dd>
                </div>
              </dl>

              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note sur la vente (facultatif)" aria-label="Note sur la vente" className={field} />

              <ErrorLine message={error} />

              <button type="button" onClick={openPayment} disabled={!lines.length} className={buttonClass("primary", "h-14 w-full text-[16px] font-semibold")}>
                <Wallet /> Encaisser <span className="tabular-nums">{mad(total)}</span>
                <span className="ml-1 rounded bg-white/20 px-1.5 text-[11px] font-medium">F8</span>
              </button>
              <p className="hidden items-center justify-center gap-1.5 text-[11px] text-muted lg:flex">
                <span className={kbd}>F2</span> recherche <span className={kbd}>F8</span> payer <span className={kbd}>F9</span> attente <span className={kbd}>Échap</span> annuler
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Retour d'action : annulation possible */}
      {(undo || notice) && (
        <div className="fixed bottom-[76px] left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-[13px] text-white lg:bottom-6" role="status">
          {undo ? (
            <>
              Vente annulée
              <button
                type="button"
                onClick={() => {
                  restore(undo);
                  setUndo(null);
                }}
                className="inline-flex items-center gap-1 font-semibold text-white underline-offset-2 hover:underline"
              >
                <Undo2 className="size-3.5" /> Rétablir
              </button>
            </>
          ) : (
            notice
          )}
        </div>
      )}

      {/* Raccourci panier (mobile) */}
      {lines.length > 0 && (
        <a href="#panier" className="fixed bottom-[76px] left-3 z-30 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-white lg:hidden">
          <ShoppingCart className="size-4" /> <span className="tabular-nums">{count}</span> · <span className="tabular-nums">{mad(total)}</span>
        </a>
      )}

      {paying && <PaymentDialog total={total} hasContact={!!contact} pending={pending} error={payError} onClose={() => setPaying(false)} onValidate={submit} />}
      {ticket && (
        <TicketDialog
          ticket={ticket}
          onClose={() => {
            setTicket(null);
            setTimeout(() => searchRef.current?.focus(), 0);
          }}
        />
      )}
      {showMoves && (
        <CashMoveDialog
          moves={entityMoves}
          onClose={() => setShowMoves(false)}
          onSubmit={async (kind, amount, reason) => {
            const r = await addCashMove(entityId, kind, amount, reason);
            if (r.error) return r.error;
            router.refresh();
            return null;
          }}
        />
      )}
      {showHeld && (
        <Modal title="Paniers en attente" subtitle="Reprenez un panier mis de côté" onClose={() => setShowHeld(false)}>
          <ul className="divide-y divide-line">
            {held.map((h) => {
              const e = entities.find((x) => x.id === h.entity_id);
              const tot = h.lines.reduce((a, l) => a + lineTotal(l), 0);
              return (
                <li key={h.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: e?.color ?? "#64748b" }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{h.contact?.full_name ?? "Client de passage"}</p>
                    <p className="truncate text-xs text-muted">
                      {fmtTime(h.at)} · {e?.short ?? h.entity_id} · {h.lines.reduce((a, l) => a + l.qty, 0)} article(s) · {mad(tot)}
                    </p>
                  </div>
                  <button type="button" onClick={() => resume(h)} className={buttonClass("brand", "h-9 px-3")}>
                    Reprendre
                  </button>
                  <button type="button" onClick={() => dropHeld(h.id)} className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Supprimer ce panier">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {!held.length && <p className="p-5 text-sm text-muted">Aucun panier en attente.</p>}
        </Modal>
      )}
    </div>
  );
}
