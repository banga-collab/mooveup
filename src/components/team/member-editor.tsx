"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Loader2, Pencil, X } from "lucide-react";
import type { MemberFormState } from "@/actions/team";
import { Field, Input, Select, buttonClass } from "@/components/ui";
import { EntityIcon } from "@/components/entity-icon";
import type { Role } from "@/lib/types";
import { ROLE_LABEL, cn } from "@/lib/utils";

type Ent = { id: string; short: string; color: string; soft: string };

export function MemberEditor({
  action,
  entities,
  member,
  self,
}: {
  action: (state: MemberFormState, formData: FormData) => Promise<MemberFormState>;
  entities: Ent[];
  member: { role: Role; entity_ids: string[]; job_title: string | null; phone: string | null; active: boolean };
  self: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MemberFormState, FormData>(action, undefined);
  const [role, setRole] = useState<Role>(member.role);
  const [ents, setEnts] = useState<string[]>(member.entity_ids);

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        {state?.ok && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="size-3.5" /> Enregistré
          </span>
        )}
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "h-8 px-3 text-xs")}>
          <Pencil className="size-3.5" /> Modifier
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 w-full space-y-4 rounded-2xl border border-line bg-canvas/70 p-4 animate-fade-up"
    >
      {state?.error && (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
        </p>
      )}
      {state?.ok && !pending && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="size-4" /> Modifications enregistrées.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <Field label="Rôle" hint={self ? "Vous ne pouvez pas changer votre propre rôle." : undefined}>
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={self}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Poste">
          <Input name="job_title" defaultValue={member.job_title ?? ""} maxLength={80} placeholder="Ex. Coach fitness" />
        </Field>
        <Field label="Téléphone">
          <Input name="phone" type="tel" defaultValue={member.phone ?? ""} maxLength={30} placeholder="06 …" />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-600">{role === "direction" ? "La direction a accès à tous les établissements" : "Établissements attribués"}</p>
        <div className={cn("flex flex-wrap gap-2", role === "direction" && "pointer-events-none opacity-40")}>
          {entities.map((e) => {
            const on = ents.includes(e.id);
            return (
              <label
                key={e.id}
                className={cn("inline-flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition", on ? "border-transparent text-white shadow-sm" : "border-line bg-white text-slate-600 hover:border-slate-300")}
                style={on ? { background: e.color } : undefined}
              >
                <input
                  type="checkbox"
                  name="entity_ids"
                  value={e.id}
                  checked={on}
                  onChange={() => setEnts(on ? ents.filter((x) => x !== e.id) : [...ents, e.id])}
                  className="sr-only"
                />
                {on ? <Check className="size-3.5" strokeWidth={3} /> : <EntityIcon id={e.id} className="size-3.5" style={{ color: e.color }} />}
                {e.short}
              </label>
            );
          })}
        </div>
      </div>

      <label className={cn("flex items-center gap-3", self && "opacity-50")}>
        <input type="checkbox" name="active" defaultChecked={member.active} disabled={self} className="peer sr-only" />
        <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-emerald-500 peer-checked:after:translate-x-5" />
        <span className="text-sm font-medium text-slate-700">{self ? "Compte actif (vous ne pouvez pas vous désactiver)" : "Compte actif (peut se connecter)"}</span>
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "h-9")}>
          <X className="size-4" /> Fermer
        </button>
        <button type="submit" disabled={pending} className={buttonClass("brand", "h-9")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Enregistrer
        </button>
      </div>
    </form>
  );
}
