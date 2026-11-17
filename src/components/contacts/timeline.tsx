import { CalendarDays, DoorOpen, Flag, Mail, MessageCircle, Phone, ShoppingBag, StickyNote } from "lucide-react";
import type { Activity, ActivityKind, Profile } from "@/lib/types";
import type { Entity } from "@/lib/entities";
import { fmtDate, fmtTime, relative } from "@/lib/utils";
import { EntityBadge } from "@/components/entity-icon";
import { Empty } from "@/components/ui";
import { ActivityComposer } from "./contact-form";

export const ACTIVITY_META: Record<ActivityKind, { label: string; icon: typeof Phone }> = {
  note: { label: "Note", icon: StickyNote },
  appel: { label: "Appel", icon: Phone },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  email: { label: "E-mail", icon: Mail },
  visite: { label: "Visite", icon: DoorOpen },
  rdv: { label: "Rendez-vous", icon: CalendarDays },
  vente: { label: "Vente", icon: ShoppingBag },
  statut: { label: "Suivi", icon: Flag },
};

/** Saisie d'un échange : modèles en un clic (« A appelé »…), Entrée pour envoyer */
export function ActivityForm({ contactId, entities, defaultEntity }: { contactId: string; entities: Entity[]; defaultEntity: string | null }) {
  return <ActivityComposer contactId={contactId} entities={entities.map((e) => ({ id: e.id, short: e.short }))} defaultEntity={defaultEntity} />;
}

export function Timeline({ items, people }: { items: Activity[]; people: Map<string, Profile> }) {
  if (!items.length) return <Empty icon={<StickyNote />} title="Aucun échange pour l'instant" text="Notez ici les appels, messages et visites pour que toute l'équipe suive le client." />;
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-line">
      {items.map((a) => {
        const m = ACTIVITY_META[a.kind] ?? ACTIVITY_META.note;
        const Icon = m.icon;
        const author = a.author_id ? people.get(a.author_id) : undefined;
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-white text-slate-500 ring-4 ring-white">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[13px] font-medium text-ink">{m.label}</span>
                {a.entity_id && <EntityBadge id={a.entity_id} />}
                <time
                  dateTime={a.created_at}
                  className="ml-auto text-xs text-muted"
                  title={`${fmtDate(a.created_at)} à ${fmtTime(a.created_at)}`}
                >
                  {relative(a.created_at)}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-700">{a.body}</p>
              <p className="mt-1 text-xs text-muted">
                {fmtDate(a.created_at, { day: "numeric", month: "short", year: "numeric" })} · {fmtTime(a.created_at)}
                {author ? ` · ${author.full_name}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
