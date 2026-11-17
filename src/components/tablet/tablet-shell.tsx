"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Camera,
  CameraOff,
  CheckCircle2,
  CloudOff,
  KeyRound,
  Languages,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Maximize,
  Minimize,
  ScanLine,
  ShoppingCart,
  Unlock,
  UserPlus,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { AppointmentStatus } from "@/lib/types";
import { dir } from "@/lib/i18n/core";
import { useLang, useT } from "@/lib/i18n/client";
import { cn, fmtTime } from "@/lib/utils";
import { Avatar, Badge } from "@/components/ui";
import { EntityBadge, EntityDots } from "@/components/entity-icon";
import { AutoRefresh } from "@/components/access/auto-refresh";
import { CameraScanner } from "@/components/access/camera";
import { OfflineBadge } from "@/components/access/offline-badge";
import { useSound } from "@/components/access/sound";
import { useDesk } from "@/components/access/use-desk";
import { VerdictView } from "@/components/access/verdict";
import type { QueuedCheckin } from "@/lib/offline/types";
import { PinPad } from "./pin-pad";
import { useTabletLock } from "./lock";

export type TabletEntry = { id: string; name: string; entity_id: string; at: string; forced: boolean; session: boolean };
export type TabletAppt = { id: string; contact_id: string; name: string; service: string; at: string; status: AppointmentStatus; entity_id: string; staff: string | null };

type View = "entries" | "agenda";

export function TabletShell({ desk, deskLabel, multi, entries, agenda }: { desk: string; deskLabel: string; multi: boolean; entries: TabletEntry[]; agenda: TabletAppt[] }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const { result, pending, lookup, checkin, force, offline } = useDesk(desk, 12_000);
  const [q, setQ] = useState("");
  const [camera, setCamera] = useState(false);
  const [view, setView] = useState<View>("entries");
  const [pad, setPad] = useState<null | "set" | "unlock">(null);
  const lock = useTabletLock();
  const [sound, toggleSound] = useSound();
  const fullscreen = useFullscreen();
  const input = useRef<HTMLInputElement>(null);

  const refocus = () => requestAnimationFrame(() => input.current?.focus());
  const go = (value: string, scan = false) => {
    lookup(value, scan);
    setQ("");
    refocus();
  };

  // La douchette tape comme un clavier : toute frappe hors champ revient au scanner
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (typing || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || document.querySelector("[aria-modal='true']")) return;
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Liste du jour à jour après chaque passage enregistré en ligne
  useEffect(() => {
    if (result?.kind === "result" && !result.v.offline) router.refresh();
  }, [result, router]);

  const leave = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    router.push("/acces");
  };
  const setLang = (l: "fr" | "ar") => {
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  const headerBtn = "inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 [&_svg]:size-5 [&_svg]:text-slate-500";

  return (
    <div dir={dir(lang)} lang={lang} className="fixed inset-0 z-[65] overflow-y-auto bg-canvas">
      <AutoRefresh seconds={30} />
      <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6">
        <header className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="size-11 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-ink">{t("tablette.title")}</p>
            <p className="truncate text-sm text-muted">
              {deskLabel || t("tablette.all")} · <Clock lang={lang} />
            </p>
          </div>
          <OfflineBadge state={offline} large />
          <button type="button" className={headerBtn} onClick={() => setLang(lang === "fr" ? "ar" : "fr")} aria-label={t("tablette.language")}>
            <Languages /> <span lang={lang === "fr" ? "ar" : "fr"}>{lang === "fr" ? "العربية" : "Français"}</span>
          </button>
          <button type="button" className={headerBtn} onClick={toggleSound} aria-pressed={sound} aria-label={sound ? t("acces.sound_on") : t("acces.sound_off")}>
            {sound ? <Volume2 /> : <VolumeX />}
          </button>
          {fullscreen.supported && (
            <button type="button" className={headerBtn} onClick={fullscreen.toggle} aria-label={fullscreen.on ? t("tablette.fullscreen_exit") : t("tablette.fullscreen")}>
              {fullscreen.on ? <Minimize /> : <Maximize />}
            </button>
          )}
          {lock.locked ? (
            <span className={cn(headerBtn, "pointer-events-none border-transparent bg-transparent")} aria-label={t("tablette.locked")}>
              <Lock />
            </span>
          ) : (
            <>
              <button type="button" className={headerBtn} onClick={() => (lock.hasPin ? lock.lock() : setPad("set"))} aria-label={t("tablette.lock")}>
                <Unlock /> <span className="hidden sm:inline">{t("tablette.lock")}</span>
              </button>
              {lock.hasPin && (
                <button type="button" className={headerBtn} onClick={() => setPad("set")} aria-label={t("tablette.pin.change")}>
                  <KeyRound />
                </button>
              )}
            </>
          )}
          <button type="button" className={headerBtn} onClick={() => (lock.locked ? setPad("unlock") : leave())}>
            <LogOut className="rtl:-scale-x-100" /> <span className="hidden sm:inline">{t("tablette.exit")}</span>
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
          className="flex gap-3"
        >
          <div className="relative min-w-0 flex-1">
            <ScanLine className="pointer-events-none absolute start-5 top-1/2 size-7 -translate-y-1/2 text-slate-400" />
            <input
              ref={input}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("tablette.scan")}
              aria-label={t("tablette.scan")}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
              className="h-20 w-full rounded-xl border border-line bg-white pe-16 ps-16 text-xl text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 sm:text-2xl"
            />
            {pending && <Loader2 className="absolute end-5 top-1/2 size-6 -translate-y-1/2 animate-spin text-slate-400" />}
          </div>
          <button
            type="button"
            onClick={() => setCamera((v) => !v)}
            aria-label={t("acces.camera")}
            aria-pressed={camera}
            className={cn("grid size-20 shrink-0 place-items-center rounded-xl border transition [&_svg]:size-8", camera ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-slate-600 hover:bg-slate-50")}
          >
            {camera ? <CameraOff /> : <Camera />}
          </button>
        </form>

        {camera && (
          <CameraScanner
            tall
            onCode={(code) => {
              setCamera(false);
              go(code, true);
            }}
            onClose={() => setCamera(false)}
          />
        )}

        <section aria-live="polite">
          {!result && (
            <div className="rounded-xl border border-dashed border-line bg-white px-6 py-8 text-center">
              <p className="text-lg font-medium text-ink">{t("tablette.ready")}</p>
              <p className="mt-1 text-base text-muted">{t("tablette.ready_text")}</p>
            </div>
          )}
          {result?.kind === "error" && <p className="rounded-xl border border-red-200 bg-red-50 px-6 py-5 text-lg text-red-700">{result.message}</p>}
          {result?.kind === "none" && (
            <div className="rounded-xl border border-line bg-white p-6 text-center">
              <p className="text-2xl font-semibold text-ink">{t("acces.none")}</p>
              <p className="mt-1 text-base text-muted">{t("acces.none_text", { q: result.query })}</p>
              <Link href="/contacts/nouveau" className="mt-5 inline-flex h-14 items-center gap-2 rounded-xl border border-line bg-white px-6 text-base font-medium text-ink hover:bg-slate-50">
                <UserPlus className="size-5 text-slate-500" /> {t("acces.new_client")}
              </Link>
            </div>
          )}
          {result?.kind === "choices" && (
            <div className="rounded-xl border border-line bg-white">
              <p className="px-6 pb-2 pt-5 text-lg font-semibold text-ink">{t("acces.choices")}</p>
              <ul className="divide-y divide-line">
                {result.hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        checkin(h.id);
                        refocus();
                      }}
                      className="flex min-h-16 w-full items-center gap-4 px-6 py-3 text-start transition hover:bg-slate-50"
                    >
                      <Avatar name={h.full_name} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-medium text-ink">{h.full_name}</span>
                        <span className="block text-sm tabular-nums text-muted" dir="ltr">
                          {h.phone ?? t("acces.no_phone")}
                        </span>
                      </span>
                      <EntityDots ids={h.entity_ids} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result?.kind === "result" && <VerdictView key={result.v.at} size="lg" v={result.v} forcing={pending} onForce={(reason) => force(result.v.contact.id, result.v.entity_id, reason)} />}
        </section>

        <nav className="grid grid-cols-3 gap-3" aria-label={t("tablette.menu")}>
          <BigButton active={view === "entries"} onClick={() => setView("entries")} icon={<LogIn />} label={t("tablette.entries")} count={entries.length + offline.pending} />
          <Link href="/caisse" className={bigClass(false)}>
            <ShoppingCart />
            <span>{t("tablette.checkout")}</span>
          </Link>
          <BigButton active={view === "agenda"} onClick={() => setView("agenda")} icon={<CalendarDays />} label={t("tablette.agenda")} count={agenda.length} />
        </nav>

        {view === "entries" ? (
          <EntriesList entries={entries} queue={offline.queue} multi={multi} />
        ) : (
          <AgendaList
            agenda={agenda}
            multi={multi}
            pending={pending}
            onArrive={(a) => {
              checkin(a.contact_id);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
      </div>

      {pad === "set" && (
        <PinPad
          confirm
          title={t("tablette.pin.choose")}
          onCancel={() => setPad(null)}
          onDone={(pin) => {
            lock.setPin(pin);
            lock.lock();
            setPad(null);
            refocus();
          }}
        />
      )}
      {pad === "unlock" && (
        <PinPad
          title={t("tablette.pin.enter")}
          onCancel={() => setPad(null)}
          onDone={(pin) => {
            if (!lock.check(pin)) return false;
            lock.unlock();
            setPad(null);
            leave();
          }}
        />
      )}
    </div>
  );
}

/* ---------- Éléments ---------- */

const bigClass = (active: boolean) =>
  cn(
    "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center text-base font-semibold transition sm:min-h-28 sm:flex-row sm:gap-3 sm:text-xl [&_svg]:size-7 [&_svg]:shrink-0",
    active ? "border-brand-500 bg-brand-50 text-brand-700 [&_svg]:text-brand-600" : "border-line bg-white text-ink hover:bg-slate-50 [&_svg]:text-slate-400",
  );

function BigButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={bigClass(active)}>
      {icon}
      <span>{label}</span>
      <span className="text-sm font-medium tabular-nums text-muted sm:text-base">{count}</span>
    </button>
  );
}

function EntriesList({ entries, queue, multi }: { entries: TabletEntry[]; queue: QueuedCheckin[]; multi: boolean }) {
  const t = useT();
  if (!entries.length && !queue.length) return <p className="rounded-xl border border-line bg-white px-6 py-8 text-center text-base text-muted">{t("tablette.no_entries")}</p>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-white">
      {[...queue].reverse().map((q) => (
        <li key={q.id} className="flex min-h-16 items-center gap-4 px-5 py-3">
          <Avatar name={q.name} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-medium text-ink">{q.name}</span>
            <span className="flex items-center gap-1.5 text-sm text-amber-700">
              <CloudOff className="size-4" /> {t("tablette.waiting")}
            </span>
          </span>
          {multi && <EntityBadge id={q.entity_id} />}
          <span className="text-base tabular-nums text-muted">{fmtTime(q.at)}</span>
        </li>
      ))}
      {entries.map((e) => (
        <li key={e.id} className="flex min-h-16 items-center gap-4 px-5 py-3">
          <Avatar name={e.name || "?"} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-medium text-ink">{e.name || t("tablette.client")}</span>
            <span className="flex flex-wrap items-center gap-2">
              {multi && <EntityBadge id={e.entity_id} />}
              {e.forced && <Badge tone="amber">{t("tablette.forced")}</Badge>}
              {e.session && <Badge tone="brand">{t("tablette.session")}</Badge>}
            </span>
          </span>
          <span className="text-base tabular-nums text-muted">{fmtTime(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}

function AgendaList({ agenda, multi, pending, onArrive }: { agenda: TabletAppt[]; multi: boolean; pending: boolean; onArrive: (a: TabletAppt) => void }) {
  const t = useT();
  if (!agenda.length) return <p className="rounded-xl border border-line bg-white px-6 py-8 text-center text-base text-muted">{t("tablette.no_agenda")}</p>;
  const now = Date.now();
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-white">
      {agenda.map((a) => {
        const waiting = a.status === "prevu" || a.status === "confirme";
        const late = waiting && new Date(a.at).getTime() < now - 10 * 60_000;
        return (
          <li key={a.id} className={cn("flex min-h-20 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3", !waiting && "opacity-70")}>
            <span className={cn("w-16 text-xl font-semibold tabular-nums", late ? "text-amber-700" : "text-ink")}>{fmtTime(a.at)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-medium text-ink">{a.name || t("tablette.client")}</span>
              <span className="block truncate text-sm text-muted">
                {a.service}
                {a.staff ? ` · ${a.staff}` : ""}
              </span>
              {multi && <EntityBadge id={a.entity_id} className="mt-1" />}
            </span>
            {waiting ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => onArrive(a)}
                className="inline-flex h-14 items-center gap-2 rounded-xl bg-brand-500 px-5 text-base font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                <CheckCircle2 className="size-5" /> {t("tablette.arrived")}
              </button>
            ) : (
              <Badge tone={a.status === "absent" ? "red" : a.status === "arrive" ? "green" : "gray"}>{t(`tablette.status.${a.status}`)}</Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Clock({ lang }: { lang: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  if (!now) return null;
  const f = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Casablanca" });
  return <time dateTime={now.toISOString()}>{f.format(now)}</time>;
}

/** Plein écran du navigateur (si disponible) */
function useFullscreen() {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    const first = setTimeout(() => {
      setSupported(!!document.documentElement.requestFullscreen);
      sync();
    }, 0);
    document.addEventListener("fullscreenchange", sync);
    return () => {
      clearTimeout(first);
      document.removeEventListener("fullscreenchange", sync);
    };
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };
  return { on, supported, toggle };
}
