import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, MoreHorizontal, RotateCcw, ThumbsDown, Trophy } from "lucide-react";
import type { Contact, Lead, LeadStage, Profile } from "@/lib/types";
import { cn, daysUntil, fmtDate, mad, SOURCE_LABEL, STAGE_LABEL, STAGES } from "@/lib/utils";
import { loseLead, moveLead } from "@/actions/leads";
import { Avatar } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { LOST_REASONS } from "@/components/contacts/helpers";

const OPEN: LeadStage[] = ["nouveau", "contacte", "essai", "offre"];

/** Échéance de la prochaine action : rouge si en retard, orange si aujourd'hui */
export function NextAction({ date }: { date: string | null }) {
  if (!date) return <span className="text-xs text-slate-400">Pas de relance prévue</span>;
  const d = daysUntil(date);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
        d < 0 ? "bg-red-50 text-red-600 ring-1 ring-inset ring-red-100" : d === 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600",
      )}
    >
      <CalendarClock className="size-3.5" />
      {d < 0 ? `En retard · ${fmtDate(date, { day: "numeric", month: "short" })}` : d === 0 ? "Aujourd'hui" : d === 1 ? "Demain" : fmtDate(date, { day: "numeric", month: "short" })}
    </span>
  );
}

/** Boutons d'étape : précédente / suivante + menu Gagné / Perdu */
export function LeadActions({ lead }: { lead: Lead }) {
  const idx = OPEN.indexOf(lead.stage);
  const prev = idx > 0 ? OPEN[idx - 1] : null;
  const next = idx >= 0 && idx < OPEN.length - 1 ? OPEN[idx + 1] : null;
  const closed = lead.stage === "gagne" || lead.stage === "perdu";

  if (closed) {
    return (
      <form action={moveLead.bind(null, lead.id, "contacte")}>
        <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted transition hover:bg-canvas hover:text-brand-600">
          <RotateCcw className="size-3.5" /> Rouvrir
        </button>
      </form>
    );
  }

  const menuId = `menu-${lead.id}`;
  return (
    <div>
      {/* Case cachée qui ouvre le menu Gagné / Perdu (sans JavaScript) */}
      <input type="checkbox" id={menuId} className="peer sr-only" />
      <div className="flex items-center gap-1">
        {prev ? (
          <form action={moveLead.bind(null, lead.id, prev)}>
            <button
              type="submit"
              title={`Revenir à « ${STAGE_LABEL[prev]} »`}
              className="grid size-8 place-items-center rounded-lg border border-line bg-white text-slate-500 transition hover:border-brand-200 hover:text-brand-600"
            >
              <ChevronLeft className="size-4" />
            </button>
          </form>
        ) : (
          <span className="size-8" />
        )}
        {next ? (
          <form action={moveLead.bind(null, lead.id, next)} className="min-w-0 flex-1">
            <button
              type="submit"
              title={`Passer à « ${STAGE_LABEL[next]} »`}
              className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-brand-500 px-2 text-xs font-bold text-white transition hover:bg-brand-600"
            >
              <span className="truncate">{STAGE_LABEL[next].split(" ")[0]}</span> <ChevronRight className="size-4 shrink-0" />
            </button>
          </form>
        ) : (
          <span className="flex-1" />
        )}
        <label
          htmlFor={menuId}
          title="Gagné ou perdu"
          className="grid size-8 cursor-pointer place-items-center rounded-lg border border-line bg-white text-slate-500 transition hover:text-ink"
        >
          <MoreHorizontal className="size-4" />
        </label>
      </div>
      <div className="mt-2 hidden space-y-2 rounded-xl border border-line bg-canvas/60 p-2.5 peer-checked:block">
        <form action={moveLead.bind(null, lead.id, "gagne")}>
          <button type="submit" className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 text-xs font-bold text-white transition hover:bg-emerald-600">
            <Trophy className="size-4" /> Gagné : devient client
          </button>
        </form>
        <form action={loseLead.bind(null, lead.id)} className="space-y-1.5">
          <select name="reason" defaultValue={LOST_REASONS[0]} className="h-9 w-full rounded-lg border border-line bg-white px-2 text-xs font-medium focus:border-brand-400 focus:outline-none">
            {LOST_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <input name="detail" placeholder="Précision (facultatif)" className="h-9 w-full rounded-lg border border-line bg-white px-2 text-xs focus:border-brand-400 focus:outline-none" />
          <button type="submit" className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white text-xs font-bold text-red-600 transition hover:bg-red-50">
            <ThumbsDown className="size-4" /> Marquer perdu
          </button>
        </form>
      </div>
    </div>
  );
}

/** Carte d'un prospect (pipeline et fiche client) */
export function LeadCard({ lead, contact, owner, showContact = true }: { lead: Lead; contact?: Contact; owner?: Profile; showContact?: boolean }) {
  const stage = STAGES.find((s) => s.id === lead.stage)!;
  return (
    <article className="group rounded-2xl border border-line bg-white p-3.5 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showContact ? (
            <Link href={`/contacts/${lead.contact_id}?tab=prospects`} className="block truncate font-display text-[15px] font-bold text-ink hover:text-brand-600">
              {contact?.full_name ?? "Contact"}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: stage.tone }}>
              <span className="size-2 rounded-full" style={{ background: stage.tone }} />
              {stage.label}
            </span>
          )}
          <p className="mt-0.5 truncate text-[13px] font-medium text-slate-600">{lead.interest || "Intérêt non précisé"}</p>
        </div>
        <span className="shrink-0 font-display text-sm font-extrabold text-accent-600">{mad(lead.value_mad)}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <EntityBadge id={lead.entity_id} />
        <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-inset ring-slate-200">{SOURCE_LABEL[lead.source]}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {lead.stage === "perdu" ? (
          <span className="truncate text-xs font-semibold text-red-600">{lead.lost_reason ?? "Perdu"}</span>
        ) : lead.stage === "gagne" ? (
          <span className="text-xs font-semibold text-emerald-600">Gagné le {fmtDate(lead.updated_at, { day: "numeric", month: "short" })}</span>
        ) : (
          <NextAction date={lead.next_action_on} />
        )}
        {owner && (
          <span title={`Suivi par ${owner.full_name}`}>
            <Avatar name={owner.full_name} size={24} />
          </span>
        )}
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <LeadActions lead={lead} />
      </div>
    </article>
  );
}
