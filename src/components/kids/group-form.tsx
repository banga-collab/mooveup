import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select } from "@/components/ui";
import { DAY_SHORT, KIDS_ACTIVITIES, type KidsGroup } from "@/lib/types-care";

/** Création / modification d'un groupe Kids */
export function GroupForm({
  action,
  group,
  coaches,
  submit = "Enregistrer",
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  group?: KidsGroup;
  coaches: { id: string; full_name: string }[];
  submit?: string;
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Nom du groupe">
          <Input name="name" defaultValue={group?.name} required placeholder="Ex. Natation 8-13 ans" />
        </Field>
        <Field label="Activité">
          <Input name="activity" list="kids-activities" defaultValue={group?.activity} required placeholder="Ex. Natation enfants" />
          <datalist id="kids-activities">
            {KIDS_ACTIVITIES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-slate-700">Jours</legend>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="cursor-pointer">
              <input type="checkbox" name="days" value={d} defaultChecked={group?.days.includes(d)} className="peer sr-only" />
              <span className="inline-flex h-9 min-w-12 items-center justify-center rounded-lg border border-line bg-white px-3 text-[13px] font-medium text-slate-600 transition peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30">
                {DAY_SHORT[d]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 [&>*]:min-w-0">
        <Field label="Début">
          <Input type="time" name="start_time" defaultValue={group?.start_time ?? "17:00"} required />
        </Field>
        <Field label="Fin">
          <Input type="time" name="end_time" defaultValue={group?.end_time ?? "18:00"} required />
        </Field>
        <Field label="Âge min.">
          <Input type="number" name="age_min" min={1} max={18} defaultValue={group?.age_min ?? 6} />
        </Field>
        <Field label="Âge max.">
          <Input type="number" name="age_max" min={1} max={18} defaultValue={group?.age_max ?? 10} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_120px_1fr] [&>*]:min-w-0">
        <Field label="Coach">
          <Select name="coach_id" defaultValue={group?.coach_id ?? ""}>
            <option value="">À définir</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Capacité">
          <Input type="number" name="capacity" min={1} max={60} defaultValue={group?.capacity ?? 12} />
        </Field>
        <Field label="Lieu">
          <Input name="location" defaultValue={group?.location ?? ""} placeholder="Ex. Grand bassin" />
        </Field>
      </div>

      <SubmitButton variant="brand">{submit}</SubmitButton>
    </ActionForm>
  );
}
