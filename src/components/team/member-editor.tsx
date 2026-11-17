"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Loader2, Pencil } from "lucide-react";
import type { MemberFormState } from "@/actions/team";
import { Field, Input, Select, buttonClass } from "@/components/ui";
import type { Role } from "@/lib/types";
import { ROLE_LABEL, cn } from "@/lib/utils";

type Ent = { id: string; short: string; color: string; soft: string };

export function MemberEditor({
  action,
  entities,
  member,
  self,
  name,
}: {
  action: (state: MemberFormState, formData: FormData) => Promise<MemberFormState>;
  entities: Ent[];
  member: { role: Role; entity_ids: string[]; job_title: string | null; phone: string | null; active: boolean };
  self: boolean;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MemberFormState, FormData>(action, undefined);
  const [role, setRole] = useState<Role>(member.role);
  const [ents, setEnts] = useState<string[]>(member.entity_ids);

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        {state?.ok && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600" role="status">
            <CheckCircle2 className="size-3.5" /> Enregistré
          </span>
        )}
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "h-9 px-3")} aria-label={name ? `Modifier ${name}` : "Modifier"}>
          <Pencil /> Modifier
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-2 w-full space-y-4 rounded-lg border border-line bg-slate-50/70 p-4">
      {state?.error && (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
        </p>
      )}
      {state?.ok && !pending && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
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

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-slate-700">{role === "direction" ? "La direction a accès à tous les établissements" : "Établissements attribués"}</legend>
        <div className={cn("flex flex-wrap gap-2", role === "direction" && "pointer-events-none opacity-40")}>
          {entities.map((e) => {
            const on = ents.includes(e.id);
            return (
              <label
                key={e.id}
                className={cn(
                  "inline-flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40",
                  on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                <input
                  type="checkbox"
                  name="entity_ids"
                  value={e.id}
                  checked={on}
                  onChange={() => setEnts(on ? ents.filter((x) => x !== e.id) : [...ents, e.id])}
                  className="sr-only"
                />
                {on ? <Check className="size-3.5" strokeWidth={2.5} /> : <span className="size-2 rounded-full" style={{ background: e.color }} />}
                {e.short}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className={cn("flex cursor-pointer items-center gap-3", self && "opacity-50")}>
        <input type="checkbox" name="active" defaultChecked={member.active} disabled={self} className="peer sr-only" />
        <span className="relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition peer-checked:bg-brand-500 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40" />
        <span className="text-[13px] text-slate-700">{self ? "Compte actif (vous ne pouvez pas vous désactiver)" : "Compte actif (peut se connecter)"}</span>
      </label>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Annuler
        </button>
        <button type="submit" disabled={pending} className={buttonClass("brand")}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Enregistrer
        </button>
      </div>
    </form>
  );
}
