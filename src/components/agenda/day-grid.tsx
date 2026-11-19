"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useOptimistic, useRef, useState, useTransition, type PointerEvent as RPointerEvent } from "react";
import { DoorOpen, Plus, Repeat, UserRound } from "lucide-react";
import { entity } from "@/lib/entities";
import { APPT_STATUS_LABEL, agadirToIso, cn, dayKey, fmtTime } from "@/lib/utils";
import type { SeriesAppointment } from "@/lib/types-agenda";
import { moveAppointment, restoreAppointment } from "@/actions/agenda-plus";
import { Avatar } from "@/components/ui";
import { EntityIcon } from "@/components/entity-icon";
import { APPT_TONE, FREE_STATUSES } from "./status";
import { hhmm, minutesOf } from "./recurrence";
import { notify } from "./undo-toast";

export type GridAppt = SeriesAppointment & { contactName: string; staffName: string | null };
/** Colonne : un praticien (vue jour) ou un jour (vue semaine) */
export type GridColumn = {
  key: string;
  label: string;
  sub: string | null;
  date: string;
  staffId: string | null;
  kind: "person" | "none" | "day";
  today?: boolean;
  href?: string;
};

export const DAY_START = 8;
export const DAY_END = 21;
const HOUR_PX = 80;
const PX = HOUR_PX / 60;
const PAD = 8;
const SNAP = 15;
const NONE = "none";

type Patch = { id: string; starts_at: string; staff_id: string | null; duration_min: number };
type Preview = { id: string; col: string; start: number; dur: number; conflict: string | null };
type Drag = {
  id: string;
  kind: "move" | "resize";
  touch: boolean;
  x0: number;
  y0: number;
  x: number;
  y: number;
  active: boolean;
  grab: number;
  start: number;
  dur: number;
  col: string;
  timer: number | null;
};

const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Répartit les rendez-vous qui se chevauchent dans des couloirs côte à côte */
type Laid = { a: GridAppt; s: number; lane: number; lanes: number; cluster: number };
function layout(list: { a: GridAppt; s: number }[]) {
  const sorted = [...list].sort((x, y) => x.s - y.s);
  const out: Laid[] = [];
  let clusterNo = 0;
  let cluster: typeof out = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    cluster.forEach((c) => (c.lanes = laneEnds.length));
    clusterNo++;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const { a, s } of sorted) {
    const e = s + a.duration_min;
    if (s >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e);
    } else laneEnds[lane] = e;
    cluster.push({ a, s, lane, lanes: 1, cluster: clusterNo });
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return out;
}

/**
 * Grille horaire interactive (bureau / tablette) :
 * glisser-déposer (souris + appui long au doigt), redimensionnement par le bas,
 * clic sur un créneau libre → nouveau rendez-vous pré-rempli, Alt + flèches au clavier.
 */
export function TimeGrid({
  mode,
  appts,
  columns,
  today,
  nowMin,
  hrefBase,
}: {
  mode: "day" | "week";
  appts: GridAppt[];
  columns: GridColumn[];
  today: string;
  nowMin: number | null;
  /** URL de la page (sans `sel`) pour ouvrir le détail */
  hrefBase: string;
}) {
  const router = useRouter();
  const [list, applyPatch] = useOptimistic(appts, (cur: GridAppt[], p: Patch) => cur.map((a) => (a.id === p.id ? { ...a, ...p } : a)));
  const [, startTransition] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [hover, setHover] = useState<{ col: string; min: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const colEls = useRef(new Map<string, HTMLDivElement>());

  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
  const height = (DAY_END - DAY_START) * HOUR_PX;
  /* Largeur minimale lisible : colonne de base, élargie quand des rendez-vous se chevauchent (vue jour) */
  const BASE_COL = mode === "day" ? 210 : 150;
  const LANE_W = 125;
  /** Vue semaine : au-delà de 2 rendez-vous simultanés, un « +N » renvoie à la journée */
  const WEEK_LANES = 2;

  const colOf = (a: { staff_id: string | null; starts_at: string }) => (mode === "day" ? (a.staff_id ?? NONE) : dayKey(a.starts_at));
  const meta = useMemo(() => new Map(list.map((a) => [a.id, { s: minutesOf(a.starts_at), date: dayKey(a.starts_at) }])), [list]);
  const byCol = useMemo(() => {
    const m = new Map<string, { a: GridAppt; s: number }[]>();
    for (const a of list) {
      const k = mode === "day" ? (a.staff_id ?? NONE) : (meta.get(a.id)?.date ?? "");
      const arr = m.get(k) ?? [];
      arr.push({ a, s: meta.get(a.id)?.s ?? 0 });
      m.set(k, arr);
    }
    return m;
  }, [list, meta, mode]);

  const laid = useMemo(() => {
    const m = new Map<string, Laid[]>();
    for (const [k, arr] of byCol) m.set(k, layout(arr));
    return m;
  }, [byCol]);
  const colWidth = (key: string) => {
    if (mode === "week") return BASE_COL;
    const lanes = Math.max(1, ...(laid.get(key) ?? []).map((x) => x.lanes));
    return Math.max(BASE_COL, Math.min(lanes, 4) * LANE_W);
  };
  const totalWidth = 56 + columns.reduce((sum, c) => sum + colWidth(c.key), 0);

  const canDrag = (a: GridAppt) => a.status !== "termine" && a.status !== "annule";
  const selHref = (id: string) => `${hrefBase}${hrefBase.includes("?") ? "&" : "?"}sel=${id}`;

  /** Rendez-vous en conflit (même praticien, même jour, horaires qui se chevauchent) */
  const conflictFor = (a: GridAppt, col: GridColumn, start: number, dur: number) => {
    const staff = mode === "day" ? col.staffId : a.staff_id;
    if (!staff) return null;
    const hit = list.find((b) => {
      if (b.id === a.id || b.staff_id !== staff || FREE_STATUSES.includes(b.status)) return false;
      const m = meta.get(b.id);
      return m && m.date === col.date && m.s < start + dur && start < m.s + b.duration_min;
    });
    return hit ? `${hit.contactName} (${fmtTime(hit.starts_at)})` : null;
  };

  /** Enregistre un déplacement : optimiste + annulation */
  const commit = (a: GridAppt, col: GridColumn, start: number, dur: number) => {
    const staffId = mode === "day" ? col.staffId : a.staff_id;
    const startsAt = agadirToIso(col.date, hhmm(start));
    if (startsAt === a.starts_at && staffId === a.staff_id && dur === a.duration_min) return;
    const prev: Patch = { id: a.id, starts_at: a.starts_at, staff_id: a.staff_id, duration_min: a.duration_min };
    startTransition(async () => {
      applyPatch({ id: a.id, starts_at: startsAt, staff_id: staffId, duration_min: dur });
      const r = await moveAppointment(a.id, { date: col.date, time: hhmm(start), staff_id: mode === "day" ? col.staffId : undefined, duration_min: dur });
      if (!r.ok) {
        notify({ m: r.error, t: "error" });
        return;
      }
      notify({
        m: `${a.contactName} · ${r.message}`,
        undo: () =>
          new Promise<void>((resolve) =>
            startTransition(async () => {
              applyPatch(prev);
              const u = await restoreAppointment(r.prev);
              if (!u.ok) notify({ m: u.error, t: "error" });
              resolve();
            }),
          ),
      });
    });
  };

  /* ---------- Calcul de la cible à partir du pointeur ---------- */
  const colAt = (x: number) => {
    let best: { key: string; d: number } | null = null;
    for (const c of columns) {
      const el = colEls.current.get(c.key);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (!best || d < best.d) best = { key: c.key, d };
    }
    return best?.key ?? null;
  };
  const minuteAt = (key: string, y: number) => {
    const el = colEls.current.get(key);
    if (!el) return DAY_START * 60;
    return DAY_START * 60 + (y - el.getBoundingClientRect().top - PAD) / PX;
  };

  const compute = (d: Drag): Preview | null => {
    const a = list.find((x) => x.id === d.id);
    if (!a) return null;
    if (d.kind === "resize") {
      const col = columns.find((c) => c.key === d.col);
      if (!col) return null;
      const end = clamp(snap(minuteAt(d.col, d.y)), d.start + SNAP, DAY_END * 60);
      const dur = end - d.start;
      return { id: d.id, col: d.col, start: d.start, dur, conflict: conflictFor(a, col, d.start, dur) };
    }
    const key = colAt(d.x);
    const col = columns.find((c) => c.key === key);
    if (!key || !col) return null;
    const start = clamp(snap(minuteAt(key, d.y) - d.grab), DAY_START * 60, DAY_END * 60 - d.dur);
    return { id: d.id, col: key, start, dur: d.dur, conflict: conflictFor(a, col, start, d.dur) };
  };

  const refreshPreview = () => {
    const d = drag.current;
    if (!d?.active) return;
    const p = compute(d);
    setPreview((cur) => (cur && p && cur.col === p.col && cur.start === p.start && cur.dur === p.dur && cur.conflict === p.conflict ? cur : p));
  };

  const dragging = !!preview;

  /* ---------- Défilement automatique près des bords ---------- */
  useEffect(() => {
    if (!dragging) return;
    let raf = 0;
    const tick = () => {
      const d = drag.current;
      if (d?.active) {
        const dy = d.y < 70 ? -12 : d.y > window.innerHeight - 70 ? 12 : 0;
        let dx = 0;
        let sy = 0;
        const sc = scrollerRef.current;
        if (sc) {
          const r = sc.getBoundingClientRect();
          if (d.x < r.left + 50 && sc.scrollLeft > 0) dx = -12;
          else if (d.x > r.right - 50 && sc.scrollLeft < sc.scrollWidth - sc.clientWidth) dx = 12;
          if (d.y < r.top + 70 && sc.scrollTop > 0) sy = -12;
          else if (d.y > r.bottom - 50 && sc.scrollTop < sc.scrollHeight - sc.clientHeight) sy = 12;
          if (dx || sy) sc.scrollBy(dx, sy);
        }
        if (dy && !sy) window.scrollBy(0, dy);
        const moved = dx !== 0 || dy !== 0 || sy !== 0;
        if (moved) impl.current.refresh();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragging]);

  /* ---------- À l'ouverture : la grille se place sur l'heure actuelle (ou le premier rendez-vous) ---------- */
  const firstMin = useMemo(() => (appts.length ? Math.min(...appts.map((a) => minutesOf(a.starts_at))) : null), [appts]);
  const showsToday = columns.some((c) => c.date === today);
  const firstDate = columns[0]?.date;
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const target = showsToday && nowMin !== null && nowMin >= DAY_START * 60 && nowMin <= DAY_END * 60 ? nowMin - 45 : (firstMin ?? DAY_START * 60) - 20;
    sc.scrollTop = Math.max(0, (target - DAY_START * 60) * PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDate, mode]);

  /* ---------- Empêche le défilement tactile pendant un glisser ---------- */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (drag.current?.active) e.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, []);

  /* Écouteurs globaux stables (le code appelé est toujours celui du dernier rendu) */
  const impl = useRef<{ move: (e: PointerEvent) => void; up: () => void; refresh: () => void }>({ move: () => {}, up: () => {}, refresh: () => {} });
  useLayoutEffect(() => {
    impl.current = { move: onMove, up: onUp, refresh: refreshPreview };
  });
  const listeners = useRef<{ move: (e: PointerEvent) => void; up: () => void; cancel: () => void } | null>(null);
  const getListeners = () =>
    (listeners.current ??= {
      move: (e: PointerEvent) => impl.current.move(e),
      up: () => impl.current.up(),
      cancel: () => endDrag(),
    });

  function endDrag() {
    const d = drag.current;
    if (d?.timer) clearTimeout(d.timer);
    drag.current = null;
    const l = getListeners();
    window.removeEventListener("pointermove", l.move);
    window.removeEventListener("pointerup", l.up);
    window.removeEventListener("pointercancel", l.cancel);
    setPreview(null);
  }

  function onMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    d.x = e.clientX;
    d.y = e.clientY;
    const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (!d.active) {
      if (d.touch && d.kind === "move") {
        if (dist > 8) endDrag(); // l'utilisateur fait défiler
        return;
      }
      if (dist < 4) return;
      d.active = true;
    }
    refreshPreview();
  }

  function onUp() {
    const d = drag.current;
    if (!d) return;
    if (d.active) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 50);
      const p = compute(d);
      const a = list.find((x) => x.id === d.id);
      const col = p && columns.find((c) => c.key === p.col);
      if (p && a && col) {
        if (p.conflict) notify({ m: `Créneau occupé par ${p.conflict} : rendez-vous non déplacé.`, t: "error" });
        else commit(a, col, p.start, p.dur);
      }
    }
    endDrag();
  }

  const begin = (e: RPointerEvent, a: GridAppt, kind: Drag["kind"]) => {
    if (!canDrag(a) || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (kind === "resize") e.stopPropagation();
    const m = meta.get(a.id);
    if (!m) return;
    const key = colOf(a);
    const touch = e.pointerType === "touch";
    const d: Drag = {
      id: a.id,
      kind,
      touch,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: kind === "resize" && touch,
      grab: minuteAt(key, e.clientY) - m.s,
      start: m.s,
      dur: a.duration_min,
      col: key,
      timer: null,
    };
    if (touch && kind === "move") {
      d.timer = window.setTimeout(() => {
        if (drag.current !== d) return;
        d.active = true;
        navigator.vibrate?.(15);
        impl.current.refresh();
      }, 300);
    }
    drag.current = d;
    const l = getListeners();
    window.addEventListener("pointermove", l.move);
    window.addEventListener("pointerup", l.up);
    window.addEventListener("pointercancel", l.cancel);
    if (d.active) refreshPreview();
  };

  /** Clavier : Alt + ↑/↓ déplace de 15 min, Alt + ←/→ change de colonne, Alt + Maj + ↑/↓ change la durée */
  const onKey = (e: React.KeyboardEvent, a: GridAppt) => {
    if (!e.altKey || !canDrag(a) || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const m = meta.get(a.id);
    const idx = columns.findIndex((c) => c.key === colOf(a));
    if (!m || idx < 0) return;
    let col = columns[idx]!;
    let start = m.s;
    let dur = a.duration_min;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") col = columns[clamp(idx + (e.key === "ArrowLeft" ? -1 : 1), 0, columns.length - 1)]!;
    else if (e.shiftKey) dur = clamp(dur + (e.key === "ArrowUp" ? -SNAP : SNAP), SNAP, DAY_END * 60 - start);
    else start = clamp(snap(start) + (e.key === "ArrowUp" ? -SNAP : SNAP), DAY_START * 60, DAY_END * 60 - dur);
    const c = conflictFor(a, col, start, dur);
    if (c) notify({ m: `Créneau occupé par ${c}.`, t: "error" });
    else commit(a, col, start, dur);
  };

  const newHref = (col: GridColumn, min: number) => {
    const p = new URLSearchParams({ date: col.date, heure: hhmm(min) });
    if (col.staffId) p.set("staff", col.staffId);
    return `/agenda/nouveau?${p.toString()}`;
  };
  const slotAt = (e: React.MouseEvent | RPointerEvent, key: string) => clamp(Math.floor(minuteAt(key, e.clientY) / SNAP) * SNAP, DAY_START * 60, DAY_END * 60 - SNAP);

  const nowVisible = showsToday && nowMin !== null && nowMin >= DAY_START * 60 && nowMin <= DAY_END * 60;

  return (
    <div ref={rootRef} className={cn("overflow-hidden rounded-xl border border-line bg-white", dragging && "select-none")} data-agenda-grid>
      <div ref={scrollerRef} className="max-h-[max(440px,calc(100dvh-236px))] overflow-auto overscroll-contain" data-agenda-scroller>
        <div className="min-w-full" style={{ width: `max(100%, ${totalWidth}px)` }}>
          {/* En-têtes (collants en haut) */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-white">
            <div className="sticky start-0 z-30 w-14 shrink-0 bg-white" />
            {columns.map((c) => {
              const n = (byCol.get(c.key) ?? []).filter(({ a }) => a.status !== "annule").length;
              const inner = (
                <>
                  {c.kind === "person" && <Avatar name={c.label} size={30} />}
                  {c.kind === "none" && (
                    <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400">
                      <UserRound className="size-4" />
                    </span>
                  )}
                  {c.kind === "day" && (
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums", c.today ? "bg-accent-500 text-white" : "bg-slate-100 text-ink")}>
                      {Number(c.date.slice(8, 10))}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("line-clamp-2 break-words text-[13px] font-semibold capitalize leading-tight", c.today ? "text-accent-600" : "text-ink")}>
                      {c.kind === "day" ? c.label.replace(/\s*\d+$/, "") : c.label}
                    </p>
                    <p className="truncate text-[11.5px] text-muted">{c.sub ?? "—"}</p>
                  </div>
                  <span className={cn("rounded-md px-1.5 text-xs font-semibold tabular-nums", n ? "bg-slate-100 text-ink" : "text-slate-300")}>{n}</span>
                </>
              );
              const cls = "flex flex-1 items-center gap-2.5 border-s border-line px-3 py-2";
              return c.href ? (
                <Link key={c.key} href={c.href} scroll={false} className={cn(cls, "transition hover:bg-slate-50")} style={{ minWidth: colWidth(c.key) }} title={`Voir la journée · ${c.label}`}>
                  {inner}
                </Link>
              ) : (
                <div key={c.key} className={cls} style={{ minWidth: colWidth(c.key) }} title={c.label}>
                  {inner}
                </div>
              );
            })}
          </div>

          <div className="relative flex" style={{ height: height + 16 }}>
            {/* Heures (collantes à gauche) */}
            <div className="sticky start-0 z-10 w-14 shrink-0 bg-white">
              {hours.map((h) => (
                <span key={h} className="absolute end-2 -translate-y-1/2 text-[11px] tabular-nums text-slate-400" style={{ top: (h - DAY_START) * HOUR_PX + PAD }}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
              {nowVisible && (
                <span
                  className="absolute end-1 z-10 -translate-y-1/2 rounded bg-accent-500 px-1 py-px text-[10.5px] font-semibold tabular-nums text-white"
                  style={{ top: ((nowMin ?? 0) - DAY_START * 60) * PX + PAD }}
                  aria-label={`Il est ${hhmm(nowMin ?? 0)}`}
                >
                  {hhmm(nowMin ?? 0)}
                </span>
              )}
            </div>

            {/* Lignes horaires */}
            <div className="pointer-events-none absolute inset-y-0 end-0 start-14">
              {hours.map((h) => (
                <div key={h}>
                  <span className="absolute inset-x-0 border-t border-line" style={{ top: (h - DAY_START) * HOUR_PX + PAD }} />
                  {h < DAY_END && <span className="absolute inset-x-0 border-t border-dashed border-line/70" style={{ top: (h - DAY_START) * HOUR_PX + PAD + HOUR_PX / 2 }} />}
                </div>
              ))}
            </div>

            {/* Colonnes */}
            {columns.map((c) => {
              const all = laid.get(c.key) ?? [];
              /* Vue semaine : les grappes de plus de 2 rendez-vous simultanés sont résumées par « +N » */
              const crowded = new Map<number, { start: number; end: number; hidden: number }>();
              if (mode === "week") {
                for (const x of all) {
                  if (x.lanes <= WEEK_LANES) continue;
                  const cl = crowded.get(x.cluster) ?? { start: Infinity, end: 0, hidden: 0 };
                  cl.start = Math.min(cl.start, x.s);
                  cl.end = Math.max(cl.end, x.s + x.a.duration_min);
                  if (x.lane !== 0) cl.hidden++;
                  crowded.set(x.cluster, cl);
                }
              }
              const items = mode === "week" ? all.filter((x) => x.lanes <= WEEK_LANES || x.lane === 0) : all;
              const ghost = preview && preview.col === c.key ? preview : null;
              const hov = !dragging && hover?.col === c.key ? hover.min : null;
              const showNow = nowMin !== null && c.date === today && nowMin >= DAY_START * 60 && nowMin <= DAY_END * 60;
              return (
                <div
                  key={c.key}
                  ref={(el) => {
                    if (el) colEls.current.set(c.key, el);
                    else colEls.current.delete(c.key);
                  }}
                  className={cn("relative flex-1 cursor-pointer border-s border-line", c.today && mode === "week" && "bg-accent-50/30")}
                  style={{ minWidth: colWidth(c.key) }}
                  onPointerMove={(e) => {
                    if (e.pointerType !== "mouse" || drag.current || e.target !== e.currentTarget) return;
                    const min = slotAt(e, c.key);
                    if (hover?.col !== c.key || hover.min !== min) setHover({ col: c.key, min });
                  }}
                  onPointerLeave={() => setHover(null)}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget || suppressClick.current) return;
                    router.push(newHref(c, slotAt(e, c.key)));
                  }}
                >
                  {/* Créneau survolé : création rapide */}
                  {hov !== null && (
                    <div
                      className="pointer-events-none absolute inset-x-1 flex items-start gap-1 rounded-md border border-dashed border-brand-300 bg-brand-50/60 px-2 py-1 text-[11px] font-medium text-brand-700"
                      style={{ top: (hov - DAY_START * 60) * PX + PAD, height: 30 * PX - 2 }}
                    >
                      <Plus className="size-3 shrink-0" /> {hhmm(hov)}
                    </div>
                  )}

                  {items.map(({ a, s, lane, lanes }) => {
                    const shown = mode === "week" ? Math.min(lanes, WEEK_LANES) : lanes;
                    const e = entity(a.entity_id);
                    const top = Math.max(0, (s - DAY_START * 60) * PX) + PAD;
                    const h = Math.max(22, a.duration_min * PX - 3);
                    const end = new Date(new Date(a.starts_at).getTime() + a.duration_min * 60000).toISOString();
                    const off = a.status === "annule" || a.status === "absent";
                    const done = a.status === "termine";
                    const isDragged = preview?.id === a.id;
                    const movable = canDrag(a);
                    const name = mode === "week" && shown > 1 ? shortName(a.contactName) : a.contactName;
                    return (
                      <Link
                        key={a.id}
                        href={selHref(a.id)}
                        scroll={false}
                        draggable={false}
                        onDragStart={(ev) => ev.preventDefault()}
                        onPointerDown={(ev) => begin(ev, a, "move")}
                        onContextMenu={(ev) => drag.current && ev.preventDefault()}
                        onClick={(ev) => suppressClick.current && ev.preventDefault()}
                        onKeyDown={(ev) => onKey(ev, a)}
                        title={`${fmtTime(a.starts_at)} – ${fmtTime(end)} · ${a.contactName} · ${a.service}${a.room ? ` · ${a.room}` : ""} · ${APPT_STATUS_LABEL[a.status]}${a.staffName ? ` · ${a.staffName}` : ""}`}
                        className={cn(
                          "group absolute overflow-hidden rounded-md border-s-[3px] px-2 py-1 text-start leading-tight transition-[box-shadow,opacity] [-webkit-touch-callout:none] hover:z-10 hover:ring-1 hover:ring-slate-300 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                          movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                          (done || !e) && "bg-slate-50",
                          off && "opacity-55",
                          isDragged && "opacity-35",
                        )}
                        style={{
                          top,
                          height: h,
                          insetInlineStart: `calc(${(lane / shown) * 100}% + 3px)`,
                          width: `calc(${100 / shown}% - 6px)`,
                          borderInlineStartColor: e?.color ?? "#1a6d8e",
                          ...(done || !e ? {} : { background: e.soft }),
                        }}
                        data-appt
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500">{fmtTime(a.starts_at)}</span>
                          <span className={cn("min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink", off && "line-through")}>{name}</span>
                          {a.series_id && <Repeat className="size-3 shrink-0 text-slate-400" aria-label="Série" />}
                          <span className={cn("size-2 shrink-0 rounded-full", APPT_TONE[a.status].dot)} />
                        </span>
                        {h >= 36 && (
                          <span className="mt-0.5 flex min-w-0 items-start gap-1 text-[11.5px] text-slate-600">
                            <EntityIcon id={a.entity_id} className="mt-px size-3 shrink-0 text-slate-400" />
                            <span className={h >= 70 ? "line-clamp-2" : "truncate"}>{a.service}</span>
                          </span>
                        )}
                        {mode === "week" && a.staffName && h >= 58 && (
                          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted">
                            <UserRound className="size-3 shrink-0" />
                            <span className="truncate">{a.staffName}</span>
                          </span>
                        )}
                        {mode === "day" && a.room && h >= 58 && (
                          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted">
                            <DoorOpen className="size-3 shrink-0" />
                            <span className="truncate">{a.room}</span>
                          </span>
                        )}
                        {movable && (
                          <span
                            onPointerDown={(ev) => begin(ev, a, "resize")}
                            onClick={(ev) => ev.preventDefault()}
                            className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize touch-none items-end justify-center opacity-0 transition group-hover:opacity-100"
                            aria-hidden
                            data-resize-handle
                          >
                            <span className="mb-0.5 h-0.5 w-6 rounded-full bg-slate-400" />
                          </span>
                        )}
                      </Link>
                    );
                  })}

                  {/* Vue semaine : grappes chargées → « +N » vers la journée */}
                  {[...crowded.entries()].map(([k, cl]) => (
                    <Link
                      key={`more-${k}`}
                      href={c.href ?? hrefBase}
                      scroll={false}
                      className="absolute z-[1] flex flex-col items-center gap-0.5 rounded-md border border-dashed border-slate-300 bg-white/90 px-1 py-1 text-center text-[12px] font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
                      style={{
                        top: (cl.start - DAY_START * 60) * PX + PAD,
                        height: Math.max(22, (cl.end - cl.start) * PX - 3),
                        insetInlineStart: "calc(50% + 3px)",
                        width: "calc(50% - 6px)",
                      }}
                      title="Voir tous les rendez-vous de la journée"
                    >
                      +{cl.hidden}
                      <span className="text-[10.5px] font-normal text-muted">RDV</span>
                    </Link>
                  ))}

                  {/* Aperçu fantôme */}
                  {ghost && (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-dashed px-2 py-1 text-[11px] font-semibold tabular-nums shadow-sm",
                        ghost.conflict ? "border-red-400 bg-red-50/90 text-red-700" : "border-brand-400 bg-brand-50/90 text-brand-700",
                      )}
                      style={{ top: (ghost.start - DAY_START * 60) * PX + PAD, height: Math.max(22, ghost.dur * PX - 3) }}
                    >
                      {hhmm(ghost.start)} – {hhmm(ghost.start + ghost.dur)}
                      <span className="block truncate font-medium">{ghost.conflict ? `Occupé : ${ghost.conflict}` : `${ghost.dur} min`}</span>
                    </div>
                  )}

                  {showNow && (
                    <div className="pointer-events-none absolute inset-x-0 z-[5] flex items-center" style={{ top: ((nowMin ?? 0) - DAY_START * 60) * PX + PAD }}>
                      <span className="size-2 -translate-x-1/2 rounded-full bg-accent-500 rtl:translate-x-1/2" />
                      <span className="h-0.5 flex-1 bg-accent-500/80" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** « Fatima Zahra Benali » → « Fatima B. » (colonnes étroites) */
function shortName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}
