import { CalendarClock, ChevronLeft, ChevronRight, MoreHorizontal, RotateCcw, ThumbsDown, Trophy } from "lucide-react";
import type { Contact, Lead, LeadStage, Profile } from "@/lib/types";
import { cn, daysUntil, fmtDate, mad, SOURCE_LABEL, STAGE_LABEL, STAGES } from "@/lib/utils";
import { loseLead, moveLead } from "@/actions/leads";
import { Avatar, Badge, buttonClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { LOST_REASONS } from "@/components/contacts/helpers";
import { ContactLink } from "@/components/quick-view/contact-link";

const STAGE_TONE: Record<LeadStage, "gray" | "brand" | "accent" | "green" | "red" | "amber"> = {
  nouveau: "gray",
  contacte: "brand",
  essai: "amber",
  offre: "accent",
  gagne: "green",
  perdu: "red",
};

/** Étape d'un prospect (badge sobre) */
export function StageBadge({ stage }: { stage: LeadStage }) {
  return (
    <Badge tone={STAGE_TONE[stage]} dot>
      {STAGE_LABEL[stage]}
    </Badge>
  );
}

const OPEN: LeadStage[] = ["nouveau", "contacte", "essai", "offre"];

/** Échéance de la prochaine action : rouge si en retard, orange si aujourd'hui */
export function NextAction({ date }: { date: string | null }) {
  if (!date) return <span className="text-xs text-slate-400">Pas de relance prévue</span>;
  const d = daysUntil(date);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium",
        d < 0 ? "bg-red-50 text-red-700" : d === 0 ? "bg-amber-50 text-amber-700" : "text-slate-500",
      )}
    >
      <CalendarClock className="size-3.5" />
      {d < 0 ? `En retard · ${fmtDate(date, { day: "numeric", month: "short" })}` : d === 0 ? "Aujourd'hui" : d === 1 ? "Demain" : fmtDate(date, { day: "numeric", month: "short" })}
    </span>
  );
}

const iconBtn =
  "grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-white text-slate-500 transition hover:border-slate-300 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40";

/** Boutons d'étape : précédente / suivante + menu Gagné / Perdu */
export function LeadActions({ lead }: { lead: Lead }) {
  const idx = OPEN.indexOf(lead.stage);
  const prev = idx > 0 ? OPEN[idx - 1] : null;
  const next = idx >= 0 && idx < OPEN.length - 1 ? OPEN[idx + 1] : null;
  const closed = lead.stage === "gagne" || lead.stage === "perdu";

  if (closed) {
    return (
      <form action={moveLead.bind(null, lead.id, "contacte")}>
        <button type="submit" className={buttonClass("ghost", "h-8 px-2 text-xs")}>
          <RotateCcw /> Rouvrir
        </button>
      </form>
    );
  }

  const menuId = `menu-${lead.id}`;
  return (
    <div>
      {/* Case cachée qui ouvre le menu Gagné / Perdu (sans JavaScript) */}
      <input type="checkbox" id={menuId} className="peer sr-only" aria-label="Clôturer : gagné ou perdu" />
      <div className="flex items-center gap-1.5 peer-focus-visible:[&_label]:ring-2 peer-focus-visible:[&_label]:ring-brand-500/40">
        {prev ? (
          <form action={moveLead.bind(null, lead.id, prev)}>
            <button type="submit" title={`Revenir à « ${STAGE_LABEL[prev]} »`} aria-label={`Revenir à « ${STAGE_LABEL[prev]} »`} className={iconBtn}>
              <ChevronLeft className="size-4" />
            </button>
          </form>
        ) : (
          <span className="size-9 shrink-0" />
        )}
        {next ? (
          <form action={moveLead.bind(null, lead.id, next)} className="min-w-0 flex-1">
            <button type="submit" title={`Passer à « ${STAGE_LABEL[next]} »`} className={buttonClass("secondary", "w-full px-2 text-xs")}>
              <span className="truncate">{STAGE_LABEL[next].split(" ")[0]}</span> <ChevronRight className="text-slate-400" />
            </button>
          </form>
        ) : (
          <span className="flex-1" />
        )}
        <label htmlFor={menuId} title="Gagné ou perdu" className={cn(iconBtn, "cursor-pointer")}>
          <MoreHorizontal className="size-4" />
        </label>
      </div>
      <div className="mt-2 hidden space-y-2 rounded-lg border border-line bg-slate-50 p-2 peer-checked:block">
        <form action={moveLead.bind(null, lead.id, "gagne")}>
          <button type="submit" className={buttonClass("secondary", "w-full text-xs text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50")}>
            <Trophy /> Gagné : devient client
          </button>
        </form>
        <form action={loseLead.bind(null, lead.id)} className="space-y-1.5">
          <select
            name="reason"
            aria-label="Raison de la perte"
            defaultValue={LOST_REASONS[0]}
            className="h-9 w-full rounded-lg border border-line bg-white px-2 text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
          >
            {LOST_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <input
            name="detail"
            aria-label="Précision"
            placeholder="Précision (facultatif)"
            className="h-9 w-full rounded-lg border border-line bg-white px-2 text-xs placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
          />
          <button type="submit" className={buttonClass("danger", "w-full text-xs")}>
            <ThumbsDown /> Marquer perdu
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
    <article className="rounded-lg border border-line bg-white p-3 transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showContact ? (
            <ContactLink id={lead.contact_id} name={contact?.full_name ?? "Contact"} className="block truncate text-sm" />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="size-2 rounded-full" style={{ background: stage.tone }} />
              {stage.label}
            </span>
          )}
          <p className="mt-0.5 truncate text-[13px] text-muted">{lead.interest || "Intérêt non précisé"}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{mad(lead.value_mad)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <EntityBadge id={lead.entity_id} />
        <span>· {SOURCE_LABEL[lead.source]}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {lead.stage === "perdu" ? (
          <span className="truncate text-xs font-medium text-red-600">{lead.lost_reason ?? "Perdu"}</span>
        ) : lead.stage === "gagne" ? (
          <span className="text-xs font-medium text-emerald-700">Gagné le {fmtDate(lead.updated_at, { day: "numeric", month: "short" })}</span>
        ) : (
          <NextAction date={lead.next_action_on} />
        )}
        {owner && (
          <span title={`Suivi par ${owner.full_name}`}>
            <Avatar name={owner.full_name} size={22} />
          </span>
        )}
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <LeadActions lead={lead} />
      </div>
    </article>
  );
}
