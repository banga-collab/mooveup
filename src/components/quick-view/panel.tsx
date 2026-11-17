"use client";

import { useCallback, useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  Repeat,
  StickyNote,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { addQuickNote, deleteQuickNote, type QuickView } from "@/actions/quick-view";
import { Avatar, Badge, buttonClass } from "@/components/ui";
import { EntityBadge, EntityDots } from "@/components/entity-icon";
import { StatusBadge, WhatsAppIcon } from "@/components/contacts/bits";
import { showToast } from "@/components/toaster";
import type { ActivityKind } from "@/lib/types";
import { cn, fmtDate, fmtTime, mad, relative } from "@/lib/utils";
import { closeQuickView, loadQuickView, peekQuickView, type QuickResult } from "./store";

type Exchange = QuickView["exchanges"][number] & { pending?: boolean };
type ExAction = { type: "add"; ex: Exchange } | { type: "del"; id: string };

const KIND_LABEL: Partial<Record<ActivityKind, string>> = { note: "Note", appel: "Appel", whatsapp: "WhatsApp", email: "E-mail" };
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Événement émis après une annulation (toast) : l'aperçu se recharge */
const REFRESH_EVENT = "moovup:refresh";

/** Panneau d'aperçu rapide d'un client (droite sur bureau, plein écran sur mobile) */
export function QuickViewPanel({ id }: { id: string }) {
  const titleId = useId();
  const pathname = usePathname();
  const startPath = useRef(pathname);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const noteBtnRef = useRef<HTMLButtonElement>(null);

  const [data, setData] = useState<QuickResult | undefined>(() => peekQuickView(id));
  const [shown, setShown] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [, startDel] = useTransition();

  const view = data && data !== "error" ? data : null;
  const [exchanges, applyEx] = useOptimistic<Exchange[], ExAction>(view?.exchanges ?? [], (list, a) =>
    a.type === "add" ? [a.ex, ...list].slice(0, 3) : list.filter((e) => e.id !== a.id),
  );

  const reload = useCallback(
    async (fresh = true) => {
      const v = await loadQuickView(id, fresh);
      setData(v);
    },
    [id],
  );

  const close = useCallback(() => {
    setShown(false);
    window.setTimeout(closeQuickView, 160);
  }, []);

  // Chargement (instantané si préchargé au survol)
  useEffect(() => {
    let alive = true;
    loadQuickView(id).then((v) => alive && setData(v));
    const onRefresh = () => void reload(true);
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => {
      alive = false;
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, [id, reload]);

  // Entrée animée, focus, défilement de la page bloqué
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setShown(true);
      closeRef.current?.focus({ preventScroll: true });
    });
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      html.style.overflow = prev;
    };
  }, []);

  // Navigation ailleurs : le panneau se ferme
  useEffect(() => {
    if (pathname !== startPath.current) closeQuickView();
  }, [pathname]);

  // Échap pour fermer, focus piégé dans le panneau
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const box = dialogRef.current;
      if (!box) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (noteOpen && document.activeElement === noteRef.current) {
          setNoteOpen(false);
          noteBtnRef.current?.focus();
        } else close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (!box.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [close, noteOpen]);

  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  const saveNote = () => {
    const text = note.trim();
    if (!text) {
      setNoteErr("Écrivez quelques mots avant d'enregistrer.");
      noteRef.current?.focus();
      return;
    }
    setNoteErr(null);
    setNote("");
    startSave(async () => {
      applyEx({ type: "add", ex: { id: `tmp-${Date.now()}`, kind: "note", body: text, at: new Date().toISOString(), author: "Moi", can_delete: false, pending: true } });
      const res = await addQuickNote(id, text).catch(() => ({ ok: false, error: "Connexion perdue : la note n'a pas été enregistrée." }));
      if (!res.ok) {
        setNote(text);
        setNoteErr(res.error ?? "Impossible d'enregistrer la note.");
        showToast(res.error ?? "Impossible d'enregistrer la note.", "error");
        return;
      }
      setNoteOpen(false);
      showToast("Note ajoutée à l'historique");
      await reload(true);
    });
  };

  const removeNote = (exId: string) => {
    startDel(async () => {
      applyEx({ type: "del", id: exId });
      const res = await deleteQuickNote(exId).catch(() => ({ ok: false, error: "Connexion perdue : la note n'a pas été supprimée." }));
      if (!res.ok) showToast(res.error ?? "Impossible de supprimer la note.", "error");
      await reload(true);
    });
  };

  return (
    <div className="no-print fixed inset-0 z-[60]">
      <div
        aria-hidden
        onClick={close}
        className={cn("absolute inset-0 bg-slate-900/30 transition-opacity duration-150", shown ? "opacity-100" : "opacity-0")}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute inset-0 flex flex-col bg-white shadow-pop transition-transform duration-200 ease-out sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[440px] sm:border-l sm:border-line",
          shown ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-x-full sm:translate-y-0",
        )}
      >
        {/* En-tête */}
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          {view ? <Avatar name={view.full_name} size={40} /> : <span className="size-10 shrink-0 animate-pulse rounded-full bg-slate-100" />}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold text-ink">
              {view ? view.full_name : data === undefined ? "Chargement…" : "Aperçu client"}
            </h2>
            {view && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={view.status} />
                <EntityDots ids={view.entity_ids} />
                {view.guardian_name && <span className="truncate text-xs text-muted">Parent : {view.guardian_name}</span>}
              </div>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Fermer l'aperçu (Échap)"
            title="Fermer (Échap)"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Contenu */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {data === undefined ? (
            <Skeleton />
          ) : data === "error" ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-ink">Impossible de charger l&apos;aperçu.</p>
              <p className="mt-1 text-[13px] text-muted">Vérifiez la connexion puis réessayez.</p>
              <button type="button" onClick={() => void reload(true)} className={buttonClass("secondary", "mt-4")}>
                Réessayer
              </button>
            </div>
          ) : data === null ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-ink">Client introuvable</p>
              <p className="mt-1 text-[13px] text-muted">Cette fiche a été supprimée ou n&apos;appartient pas à vos établissements.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Coordonnées */}
              {(data.phone || data.email) && (
                <div className="flex flex-wrap gap-2">
                  {data.phone && (
                    <a href={`tel:${data.phone.replace(/\s/g, "")}`} className={buttonClass("secondary", "tabular-nums")}>
                      <Phone /> {data.phone}
                    </a>
                  )}
                  {data.whatsapp && (
                    <a href={data.whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")} aria-label={`WhatsApp ${data.full_name}`}>
                      <WhatsAppIcon className="size-4 text-emerald-600" /> WhatsApp
                    </a>
                  )}
                  {data.email && (
                    <a href={`mailto:${data.email}`} className={buttonClass("secondary", "min-w-0 max-w-full")}>
                      <Mail /> <span className="truncate">{data.email}</span>
                    </a>
                  )}
                </div>
              )}

              {/* Alertes */}
              {data.alerts.length > 0 && (
                <ul className="space-y-1.5">
                  {data.alerts.map((a, i) => (
                    <li
                      key={i}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]",
                        a.tone === "red" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800",
                      )}
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0">{a.text}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Chiffres clés */}
              <div className="grid grid-cols-3 gap-2 [&>*]:min-w-0">
                <Stat label="Solde dû" value={data.due_mad > 0 ? mad(data.due_mad) : "À jour"} alert={data.due_mad > 0} />
                <Stat label="Fidélité" value={data.points === null ? "—" : `${data.points} pts`} />
                <Stat
                  label="Prochain RDV"
                  value={data.next_appt ? fmtDate(data.next_appt.starts_at, { day: "numeric", month: "short" }) : "Aucun"}
                  sub={data.next_appt ? `${fmtTime(data.next_appt.starts_at)} · ${data.next_appt.service}` : undefined}
                />
              </div>

              {/* Abonnements */}
              <Section title="Abonnements en cours" count={data.subs.length}>
                {data.subs.length ? (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {data.subs.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            <EntityBadge id={s.entity_id} />
                            <span>fin {fmtDate(s.end_date, { day: "numeric", month: "short" })}</span>
                            {s.sessions_left !== null && <span>{s.sessions_left} séance{s.sessions_left > 1 ? "s" : ""}</span>}
                          </p>
                        </div>
                        {s.status === "suspendu" ? (
                          <Badge tone="gray">Suspendu</Badge>
                        ) : (
                          <Badge tone={s.days_left <= 7 ? "amber" : "green"}>{s.days_left === 0 ? "Dernier jour" : `${s.days_left} j`}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">Aucun abonnement en cours.</p>
                )}
              </Section>

              {/* Visites */}
              <Section title="Dernières visites">
                {data.visits.length ? (
                  <ul className="space-y-2">
                    {data.visits.map((v, i) => (
                      <li key={i} className="flex items-center gap-2 text-[13px]">
                        <CalendarClock className="size-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1 truncate text-ink">{v.label}</span>
                        {v.entity_id && <EntityBadge id={v.entity_id} className="hidden sm:inline-flex" />}
                        <span className="shrink-0 text-xs tabular-nums text-muted">{fmtDate(v.at, { day: "numeric", month: "short" })}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">Aucune visite enregistrée.</p>
                )}
              </Section>

              {/* Échanges */}
              <Section title="Derniers échanges">
                {noteOpen && (
                  <div className="mb-3 space-y-2">
                    <label htmlFor={`${titleId}-note`} className="sr-only">
                      Note rapide
                    </label>
                    <textarea
                      id={`${titleId}-note`}
                      ref={noteRef}
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                        if (noteErr) setNoteErr(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          saveNote();
                        }
                      }}
                      rows={3}
                      maxLength={2000}
                      placeholder="Ex. Rappeler jeudi pour le renouvellement"
                      aria-invalid={noteErr ? true : undefined}
                      className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                    {noteErr && (
                      <p role="alert" className="text-[13px] text-red-600">
                        {noteErr}
                      </p>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <span className="mr-auto hidden text-xs text-muted sm:inline">Ctrl+Entrée pour enregistrer</span>
                      <button type="button" onClick={() => setNoteOpen(false)} className={buttonClass("ghost")}>
                        Fermer
                      </button>
                      <button type="button" onClick={saveNote} disabled={saving} className={buttonClass("brand")}>
                        {saving ? <Loader2 className="animate-spin" /> : <StickyNote />} Enregistrer
                      </button>
                    </div>
                  </div>
                )}
                {exchanges.length ? (
                  <ul className="space-y-2.5">
                    {exchanges.map((x) => (
                      <li key={x.id} className={cn("group/ex flex items-start gap-2", x.pending && "opacity-60")}>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted">
                            <span className="font-medium text-slate-600">{KIND_LABEL[x.kind] ?? "Échange"}</span>
                            {x.author && ` · ${x.author}`} · {x.pending ? "enregistrement…" : relative(x.at)}
                          </p>
                          <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-[13px] text-ink">{x.body}</p>
                        </div>
                        {x.can_delete && !x.pending && (
                          <button
                            type="button"
                            onClick={() => removeNote(x.id)}
                            aria-label="Supprimer cette note"
                            title="Supprimer (annulable)"
                            className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-600 focus-visible:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  !noteOpen && <p className="text-[13px] text-muted">Aucun échange pour l&apos;instant.</p>
                )}
              </Section>
            </div>
          )}
        </div>

        {/* Actions */}
        {view && (
          <div className="border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <Link href={`/caisse?contact=${view.id}`} onClick={closeQuickView} className={buttonClass("primary", "w-full")}>
              <Wallet /> Encaisser
            </Link>
            <div className="mt-2 grid grid-cols-4 gap-1.5 [&>*]:min-w-0">
              <Link href={`/agenda/nouveau?contact=${view.id}`} onClick={closeQuickView} className={actionClass}>
                <CalendarPlus /> RDV
              </Link>
              <Link href={`/abonnements/nouveau?contact=${view.id}`} onClick={closeQuickView} className={actionClass}>
                <Repeat /> Abonnement
              </Link>
              <button ref={noteBtnRef} type="button" onClick={() => setNoteOpen((o) => !o)} aria-expanded={noteOpen} className={cn(actionClass, noteOpen && "border-brand-500 text-brand-600")}>
                <StickyNote /> Note
              </button>
              <Link href={`/contacts/${view.id}`} onClick={closeQuickView} className={actionClass}>
                <ExternalLink /> Fiche
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const actionClass =
  "flex h-14 flex-col items-center justify-center gap-1 rounded-lg border border-line bg-white px-1 text-xs font-medium text-ink transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 [&_svg]:size-4 [&_svg]:text-slate-400 truncate";

function Stat({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border border-line px-2.5 py-2">
      <p className="truncate text-[11px] text-muted">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums", alert ? "text-red-600" : "text-ink")}>{value}</p>
      {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        {title}
        {count ? <span className="text-xs font-normal tabular-nums text-muted">{count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement de l'aperçu">
      <div className="flex gap-2">
        <span className="h-9 w-32 animate-pulse rounded-lg bg-slate-100" />
        <span className="h-9 w-28 animate-pulse rounded-lg bg-slate-100" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <span key={i} className="block h-12 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}
