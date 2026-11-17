"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { createTask, type TaskFormState } from "@/actions/tasks";
import { ContactPicker, type PickerContact } from "@/components/contact-picker";
import { Field, Input, Select, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { TaskPriority } from "@/lib/types";
import { PRIORITY_META } from "./priority";

type Ent = { id: string; short: string; color: string };
type Member = { id: string; full_name: string; entity_ids: string[]; job_title: string | null };


function Fields({ entities, defaultEntity, team, contacts, meId, today }: { entities: Ent[]; defaultEntity: string; team: Member[]; contacts: PickerContact[]; meId: string; today: string }) {
  const [eid, setEid] = useState(defaultEntity);
  const [prio, setPrio] = useState<TaskPriority>("normale");
  const members = team.filter((m) => !m.entity_ids.length || m.entity_ids.includes(eid));

  return (
    <div className="space-y-3.5">
      <Field label="À faire">
        <Input name="title" required maxLength={200} placeholder="Ex. Rappeler pour le renouvellement" autoComplete="off" />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 [&>*]:min-w-0">
        <Field label="Établissement">
          <Select name="entity_id" value={eid} onChange={(e) => setEid(e.target.value)}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.short}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignée à">
          <Select name="assigned_to" defaultValue={members.some((m) => m.id === meId) ? meId : (members[0]?.id ?? "")}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === meId ? `Moi (${m.full_name})` : m.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Échéance">
          <Input type="date" name="due_date" defaultValue={today} />
        </Field>
        <div role="group" aria-label="Priorité">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Priorité</span>
          <input type="hidden" name="priority" value={prio} />
          <div className="grid h-10 grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-0.5">
            {(["basse", "normale", "haute"] as const).map((p) => {
              const on = prio === p;
              const m = PRIORITY_META[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrio(p)}
                  className={cn(
                    "rounded-md text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                    on ? (p === "haute" ? "bg-white text-red-600 shadow-sm" : "bg-white text-ink shadow-sm") : "text-slate-500 hover:text-ink",
                  )}
                  aria-pressed={on}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <Field label="Client (facultatif)">
        <ContactPicker contacts={contacts} />
      </Field>
    </div>
  );
}

/** Formulaire d'ajout rapide d'une tâche */
export function TaskQuickForm(props: { entities: Ent[]; defaultEntity: string; team: Member[]; contacts: PickerContact[]; meId: string; today: string }) {
  const [state, action, pending] = useActionState<TaskFormState, FormData>(createTask, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
        </p>
      )}
      {state?.ok && !pending && (
        <p key={state.ok} role="status" className="flex animate-fade-up items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          <CheckCircle2 className="size-4 shrink-0" /> Tâche ajoutée.
        </p>
      )}
      <Fields key={state?.ok ?? 0} {...props} />
      <button type="submit" disabled={pending} className={buttonClass("brand", "w-full")}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />} Ajouter la tâche
      </button>
    </form>
  );
}
