import { CalendarDays, DoorOpen, Flag, Mail, MessageCircle, Phone, Send, ShoppingBag, StickyNote } from "lucide-react";
import type { Activity, ActivityKind, Profile } from "@/lib/types";
import type { Entity } from "@/lib/entities";
import { fmtDate, fmtTime, relative } from "@/lib/utils";
import { addActivity } from "@/actions/contacts";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { EntityBadge } from "@/components/entity-icon";
import { Empty, Textarea } from "@/components/ui";

export const ACTIVITY_META: Record<ActivityKind, { label: string; color: string; icon: typeof Phone }> = {
  note: { label: "Note", color: "#64748b", icon: StickyNote },
  appel: { label: "Appel", color: "#1a6d8e", icon: Phone },
  whatsapp: { label: "WhatsApp", color: "#059669", icon: MessageCircle },
  email: { label: "E-mail", color: "#0284c7", icon: Mail },
  visite: { label: "Visite", color: "#7c4dcc", icon: DoorOpen },
  rdv: { label: "Rendez-vous", color: "#e9a213", icon: CalendarDays },
  vente: { label: "Vente", color: "#e8782a", icon: ShoppingBag },
  statut: { label: "Suivi", color: "#d9467a", icon: Flag },
};

const FORM_KINDS: ActivityKind[] = ["note", "appel", "whatsapp", "email", "visite"];

export function ActivityForm({ contactId, entities, defaultEntity }: { contactId: string; entities: Entity[]; defaultEntity: string | null }) {
  return (
    <ActionForm action={addActivity.bind(null, contactId)} className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FORM_KINDS.map((k, i) => {
          const m = ACTIVITY_META[k];
          const Icon = m.icon;
          return (
            <label key={k} className="cursor-pointer">
              <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="peer sr-only" />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition peer-checked:border-transparent peer-checked:bg-brand-500 peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100 hover:bg-canvas">
                <Icon className="size-3.5" /> {m.label}
              </span>
            </label>
          );
        })}
      </div>
      <Textarea name="body" required placeholder="Ex. : Appelée pour la relance, rappeler samedi matin." className="min-h-[76px]" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {entities.length > 1 ? (
          <select
            name="entity_id"
            defaultValue={defaultEntity ?? entities[0]!.id}
            className="h-10 min-w-0 max-w-full rounded-xl border border-line bg-white px-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.short}
              </option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="entity_id" value={entities[0]?.id ?? ""} />
        )}
        <SubmitButton variant="brand" className="ml-auto">
          <Send className="size-4" /> Ajouter
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function Timeline({ items, people }: { items: Activity[]; people: Map<string, Profile> }) {
  if (!items.length) return <Empty icon={<StickyNote className="size-6" />} title="Aucun échange pour l'instant" text="Notez ici les appels, messages et visites pour que toute l'équipe suive le client." />;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-0.5 before:bg-line">
      {items.map((a) => {
        const m = ACTIVITY_META[a.kind] ?? ACTIVITY_META.note;
        const Icon = m.icon;
        const author = a.author_id ? people.get(a.author_id) : undefined;
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className="relative z-10 grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-sm ring-4 ring-white" style={{ background: m.color }}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 rounded-2xl border border-line bg-white px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-bold" style={{ color: m.color }}>
                  {m.label}
                </span>
                {a.entity_id && <EntityBadge id={a.entity_id} />}
                <span className="ml-auto text-[11px] text-muted" title={`${fmtDate(a.created_at)} à ${fmtTime(a.created_at)}`}>
                  {relative(a.created_at)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-ink">{a.body}</p>
              <p className="mt-1 text-[11px] text-muted">
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
