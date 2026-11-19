"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlarmClock, Bell, BellOff, Boxes, CalendarClock, CheckCheck, CreditCard, Globe, ListChecks, Loader2, MessageSquareWarning, Receipt, Star, Wallet, type LucideIcon } from "lucide-react";
import { getNotifications, markNotificationsRead } from "@/actions/notifications";
import { useT } from "@/lib/i18n/client";
import type { AppNotification, NotificationKind } from "@/lib/types-shell";
import { cn } from "@/lib/utils";

type Ctx = { items: AppNotification[]; loading: boolean; refresh: () => void; markRead: (keys: string[]) => void };
const NotifContext = createContext<Ctx>({ items: [], loading: false, refresh: () => {}, markRead: () => {} });

/** Charge les notifications une fois pour toute la coquille (barre du haut + mobile) */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, start] = useTransition();
  const last = useRef(0);
  const path = usePathname();

  const refresh = useCallback(() => {
    last.current = Date.now();
    start(async () => {
      try {
        setItems(await getNotifications());
      } catch {
        // hors ligne : on garde la liste précédente
      }
    });
  }, []);

  // Au chargement, à chaque changement de page (au plus une fois par minute), toutes les 3 min et au retour sur l'onglet.
  // Léger différé : la page affichée passe d'abord, et un clic de menu n'interrompt pas une requête en cours
  // (une action serveur interrompue par une navigation force un rechargement complet de la page).
  useEffect(() => {
    if (Date.now() - last.current <= 60_000) return;
    const id = window.setTimeout(refresh, last.current ? 2500 : 1200);
    return () => window.clearTimeout(id);
  }, [path, refresh]);
  useEffect(() => {
    const id = setInterval(refresh, 180_000);
    const onFocus = () => Date.now() - last.current > 60_000 && refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const markRead = useCallback((keys: string[]) => {
    if (!keys.length) return;
    setItems((cur) => cur.map((n) => (keys.includes(n.key) ? { ...n, read: true } : n)));
    void markNotificationsRead(keys).catch(() => {});
  }, []);

  return <NotifContext.Provider value={{ items, loading, refresh, markRead }}>{children}</NotifContext.Provider>;
}

const ICONS: Record<NotificationKind, LucideIcon> = {
  rdv: CalendarClock,
  stock: Boxes,
  caisse: Wallet,
  abonnement: CreditCard,
  impaye: Receipt,
  avis: Star,
  tache: ListChecks,
  reservation: Globe,
  prospect: AlarmClock,
  reclamation: MessageSquareWarning,
};

/** Cloche de notifications intelligentes (badge = non lues) */
export function NotificationBell({ className }: { className?: string }) {
  const t = useT();
  const { items, loading, markRead } = useContext(NotifContext);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread.length ? t("notif.titleCount", { n: unread.length }) : t("notif.title")}
        className="relative grid size-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        <Bell className="size-[18px]" strokeWidth={1.8} />
        {unread.length > 0 && (
          <span className="absolute -end-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent-500 px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white tabular-nums">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label={t("notif.title")} className="absolute end-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-line bg-white shadow-pop animate-fade-up">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <p className="flex-1 text-sm font-semibold text-ink">{t("notif.title")}</p>
            {loading && <Loader2 className="size-3.5 animate-spin text-slate-400" aria-hidden />}
            {unread.length > 0 && (
              <button type="button" onClick={() => markRead(unread.map((n) => n.key))} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-brand-600 hover:bg-brand-50">
                <CheckCheck className="size-3.5" /> {t("notif.markAll")}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-8 text-center">
              <BellOff className="size-5 text-slate-300" aria-hidden />
              <p className="mt-2 text-[13px] font-medium text-ink">{t("notif.empty")}</p>
              <p className="mt-0.5 text-xs text-muted">{t("notif.emptyText")}</p>
            </div>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {items.map((n) => {
                const Icon = ICONS[n.kind];
                return (
                  <li key={n.key}>
                    <Link href={n.href} onClick={() => markRead([n.key])} className={cn("flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50", n.read && "opacity-60")}>
                      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", n.tone === "alert" ? "bg-accent-50 text-accent-600" : "bg-slate-100 text-slate-500")}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                          <span className="tabular-nums">{n.count}</span>
                          <span className="truncate">{t(n.titleKey)}</span>
                        </span>
                        {n.detail && <span className="mt-0.5 block truncate text-xs text-muted">{n.detail}</span>}
                      </span>
                      {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-500" aria-label={t("notif.unread")} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
