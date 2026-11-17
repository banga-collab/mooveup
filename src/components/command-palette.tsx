"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock,
  CornerDownLeft,
  CreditCard,
  Filter,
  Gift,
  ListChecks,
  Loader2,
  Megaphone,
  Package,
  Receipt,
  Search,
  ShoppingCart,
  Truck,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { QUICK_ACTIONS, navFor, navLabel } from "@/lib/nav";
import type { Role } from "@/lib/types";
import type { SearchGroup, SearchResult } from "@/lib/types-shell";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n/client";
import { searchAll } from "@/actions/search";
import { EntityDots } from "./entity-icon";
import { clearRecent, getRecent, pushRecent, setFlag, type Recent } from "./shell/prefs";

type Item = {
  key: string;
  label: string;
  sub?: string;
  href: string;
  icon: LucideIcon;
  group: string;
  entity_ids?: string[];
  /** Résultat de recherche ou élément récent (mémorisé dans « Récents ») */
  result?: Recent;
  recent?: boolean;
  contact_id?: string;
};

const GROUP_ICON: Record<SearchGroup, LucideIcon> = {
  clients: UserRound,
  ventes: Receipt,
  rdv: CalendarDays,
  prospects: Filter,
  abonnements: CreditCard,
  catalogue: Package,
  cartes: Gift,
  taches: ListChecks,
  fournisseurs: Truck,
  campagnes: Megaphone,
  equipe: UsersRound,
};

/** Sans accents ni casse */
function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Met en évidence les mots recherchés (insensible aux accents et à la casse) */
function Highlight({ text, q }: { text: string; q: string }) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length || !text) return <>{text}</>;
  const chars = [...text];
  let flat = "";
  const map: number[] = [];
  chars.forEach((ch, i) => {
    for (const c of norm(ch)) {
      flat += c;
      map.push(i);
    }
  });
  const on = new Array<boolean>(chars.length).fill(false);
  for (const w of words) {
    let at = flat.indexOf(w);
    while (at !== -1) {
      for (let k = at; k < at + w.length; k++) on[map[k]!] = true;
      at = flat.indexOf(w, at + w.length);
    }
  }
  const parts: { s: string; hl: boolean }[] = [];
  chars.forEach((c, i) => {
    const last = parts[parts.length - 1];
    if (last && last.hl === on[i]) last.s += c;
    else parts.push({ s: c, hl: !!on[i] });
  });
  return (
    <>
      {parts.map((p, i) =>
        p.hl ? (
          <mark key={i} className="hl">
            {p.s}
          </mark>
        ) : (
          <Fragment key={i}>{p.s}</Fragment>
        ),
      )}
    </>
  );
}

/** Fiches dont la visite est mémorisée dans « Récents » (titre de la page) */
const DETAIL = /^\/(contacts|ventes|catalogue|campagnes|fidelite\/cartes)\/([0-9a-z-]{8,})$/i;
const DETAIL_GROUP: Record<string, SearchGroup> = { contacts: "clients", ventes: "ventes", catalogue: "catalogue", campagnes: "campagnes", "fidelite/cartes": "cartes" };

/** Palette de commandes : Ctrl+K (ou ⌘K) ou « / » pour chercher dans tout le CRM */
export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const path = usePathname();
  const t = useT();
  const rtl = useLang() === "ar";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState("");
  const [sel, setSel] = useState(0);
  const [focus, setFocus] = useState<Item | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key.toLowerCase() === "k" || e.code === "KeyK") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    const m = path.match(DETAIL);
    if (!m) return;
    const id = setTimeout(() => {
      const label = document.title.replace(/\s·\sMoov'Up CRM$/, "").trim();
      if (!label || label === "Moov'Up CRM") return;
      const group = DETAIL_GROUP[m[1]!.toLowerCase()] ?? "clients";
      pushRecent({ id: m[2]!, group, label, href: path, contact_id: group === "clients" ? m[2] : undefined });
    }, 900);
    return () => clearTimeout(id);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setHits([]);
    setSearched("");
    setSel(0);
    setFocus(null);
    setRecent(getRecent());
    setFlag("palette");
    const id = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    const id = ++reqId.current;
    if (term.length < 2) {
      setHits([]);
      setSearched("");
      return;
    }
    const timer = setTimeout(
      () =>
        start(async () => {
          try {
            const res = await searchAll(term);
            if (id === reqId.current) {
              setHits(res);
              setSearched(term);
            }
          } catch {
            if (id === reqId.current) setSearched(term);
          }
        }),
      140,
    );
    return () => clearTimeout(timer);
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const n = norm(q.trim());
    const match = (s: string) => !n || n.split(/\s+/).every((w) => norm(s).includes(w));

    // Actions rapides pour le client sélectionné (Tab ou →)
    if (focus?.contact_id) {
      const first = focus.label.split(/\s+/)[0] || focus.label;
      const cid = focus.contact_id;
      const g = t("pal.clientActions", { name: focus.label });
      return [
        { key: "x-sale", label: t("pal.sellTo", { name: first }), href: `/caisse?contact=${cid}`, icon: ShoppingCart, group: g },
        { key: "x-rdv", label: t("pal.rdvFor", { name: first }), href: `/agenda/nouveau?contact=${cid}`, icon: CalendarPlus, group: g },
        { key: "x-sub", label: t("pal.subFor", { name: first }), href: `/abonnements/nouveau?contact=${cid}`, icon: CreditCard, group: g },
        { key: "x-open", label: t("pal.openFile"), href: `/contacts/${cid}`, icon: UserRound, group: g },
      ];
    }

    const results: Item[] = hits.map((h) => ({
      key: `${h.group}-${h.id}`,
      label: h.label,
      sub: h.sub,
      href: h.href,
      icon: GROUP_ICON[h.group] ?? Search,
      group: t(`search.${h.group}`),
      entity_ids: h.entity_ids,
      contact_id: h.contact_id,
      result: { id: h.id, group: h.group, label: h.label, sub: h.sub, href: h.href, contact_id: h.contact_id },
    }));
    const recents: Item[] = n
      ? []
      : recent.map((r) => ({ key: `r-${r.href}`, label: r.label, sub: r.sub, href: r.href, icon: Clock, group: t("pal.recent"), contact_id: r.contact_id, result: r, recent: true }));
    const actions: Item[] = QUICK_ACTIONS.filter((a) => match(`${t(a.key)} ${a.label}`)).map((a) => ({ key: `a-${a.href}`, label: t(a.key), href: a.href, icon: a.icon, group: t("pal.actions") }));
    const pages: Item[] = navFor(role)
      .flatMap((g) => g.items)
      .filter((p) => match(`${navLabel(t, p)} ${p.label} ${p.keywords ?? ""}`))
      .map((p) => ({ key: `p-${p.href}`, label: navLabel(t, p), href: p.href, icon: p.icon, group: t("pal.pages") }));
    return [...recents, ...results, ...actions.slice(0, n ? 4 : 5), ...pages.slice(0, 6)];
  }, [q, hits, role, recent, focus, t]);

  useEffect(() => setSel(0), [items.length, focus]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const go = (it: Item | undefined) => {
    if (!it) return;
    if (it.result) pushRecent(it.result);
    else if (focus?.result) pushRecent(focus.result);
    setOpen(false);
    router.push(it.href);
  };
  const enter = (it: Item | undefined) => {
    if (it?.contact_id && !focus) {
      setFocus(it);
      return true;
    }
    return false;
  };

  if (!open) return null;
  let lastGroup = "";
  const term = q.trim();
  const fwd = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  const recentHead = t("pal.recent");

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/20 px-3 pt-[10vh] backdrop-blur-[2px] sm:px-4" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={t("pal.label")} className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-white shadow-pop animate-fade-up" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          {focus ? (
            <button
              type="button"
              onClick={() => {
                setFocus(null);
                inputRef.current?.focus();
              }}
              className="-ms-1 grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-ink"
              aria-label={t("common.back")}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" />
            </button>
          ) : pending ? (
            <Loader2 className="size-4 animate-spin text-brand-500" aria-hidden />
          ) : (
            <Search className="size-4 text-slate-400" aria-hidden />
          )}
          <input
            ref={inputRef}
            value={q}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[sel] ? `pal-${sel}` : undefined}
            aria-label={t("pal.placeholder")}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQ(e.target.value);
              setFocus(null);
            }}
            onKeyDown={(e) => {
              const it = items[sel];
              const atEnd = (e.currentTarget.selectionStart ?? 0) >= q.length;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(items.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(it);
              } else if (focus && ((e.key === "Tab" && e.shiftKey) || e.key === back || (e.key === "Backspace" && !q) || e.key === "Escape")) {
                e.preventDefault();
                setFocus(null);
              } else if (e.key === "Tab" || (e.key === fwd && atEnd)) {
                if (enter(it) || e.key === "Tab") e.preventDefault();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={focus ? t("pal.chooseAction") : t("pal.placeholder")}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[11px] text-slate-400 sm:inline">{t("pal.esc")}</kbd>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" aria-label={t("pal.label")} className="max-h-[58vh] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">{term.length >= 2 ? (pending || searched !== term ? t("pal.searching") : t("pal.none", { q: term })) : t("pal.min")}</p>
          )}
          {term.length >= 2 && !pending && searched === term && hits.length === 0 && items.length > 0 && <p className="px-2.5 pb-1 pt-2 text-xs text-muted">{t("pal.noData", { q: term })}</p>}
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {head && (
                  <div className="flex items-center px-2.5 pb-1 pt-2.5">
                    <p className="flex-1 text-[11px] font-medium text-slate-400">{head}</p>
                    {head === recentHead && (
                      <button
                        type="button"
                        onClick={() => {
                          clearRecent();
                          setRecent([]);
                          inputRef.current?.focus();
                        }}
                        className="text-[11px] text-slate-400 hover:text-ink"
                      >
                        {t("pal.clear")}
                      </button>
                    )}
                  </div>
                )}
                <div
                  id={`pal-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === sel}
                  onMouseMove={() => sel !== i && setSel(i)}
                  onClick={() => go(it)}
                  className={cn("group flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm", i === sel ? "bg-slate-100 text-ink" : "text-slate-700")}
                >
                  <it.icon className="size-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <Highlight text={it.label} q={it.recent || focus ? "" : it.result ? searched : term} />
                    </span>
                    {it.sub && (
                      <span className="block truncate text-xs text-muted">
                        <Highlight text={it.sub} q={it.recent ? "" : searched} />
                      </span>
                    )}
                  </span>
                  {it.entity_ids && it.entity_ids.length > 0 && <EntityDots ids={it.entity_ids} />}
                  {it.contact_id && !focus && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocus(it);
                        inputRef.current?.focus();
                      }}
                      className={cn("h-7 items-center gap-0.5 rounded-md border border-line bg-white px-1.5 text-[11px] font-medium text-slate-500 hover:text-ink", i === sel ? "inline-flex" : "hidden group-hover:inline-flex")}
                      aria-label={t("pal.clientActions", { name: it.label })}
                    >
                      {t("pal.actionsShort")} <ChevronRight className="size-3 rtl:rotate-180" aria-hidden />
                    </button>
                  )}
                  {i === sel ? <CornerDownLeft className="size-3.5 shrink-0 text-slate-400 rtl:-scale-x-100" aria-hidden /> : <span className="size-3.5 shrink-0" />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-slate-400 sm:flex">
          <span>
            <Kb>↑</Kb>
            <Kb>↓</Kb> {t("pal.navigate")}
          </span>
          <span>
            <Kb>↵</Kb> {t("pal.open")}
          </span>
          <span>
            <Kb>Tab</Kb> {t("pal.tabHint")}
          </span>
        </div>
      </div>
    </div>
  );
}

function Kb({ children }: { children: React.ReactNode }) {
  return <kbd className="me-0.5 inline-grid min-w-[18px] place-items-center rounded border border-line px-1 font-sans text-[10.5px] text-slate-500">{children}</kbd>;
}
