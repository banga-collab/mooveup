import Link from "next/link";
import { Check, Minus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";
import { addDaysKey, age, cn, dayKey, fmtDate, waLink } from "@/lib/utils";
import { attendanceRate, daysLabel, type KidsAttendance, type KidsChild, type KidsGroup, type KidsMember } from "@/lib/types-care";
import { saveChild } from "@/actions/kids";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { WhatsAppIcon } from "@/components/contacts/bits";
import { Badge, buttonClass, Card, CardHeader, Empty, Field, Input, Select } from "@/components/ui";

const RELATIONS = ["Mère", "Père", "Tuteur", "Grand-parent", "Autre"];

/** Fiche enfant Moov'Up Kids : parents, autorisations, groupes et présence */
export async function KidsChildPanel({ contact }: { contact: Contact }) {
  const supabase = await createClient();
  const since = addDaysKey(dayKey(), -28);
  const [{ data: ch }, { data: mem }, { data: att }] = await Promise.all([
    supabase.from("kids_children").select("*").eq("contact_id", contact.id).maybeSingle(),
    supabase.from("kids_members").select("*").eq("contact_id", contact.id),
    supabase.from("kids_attendance").select("*").eq("contact_id", contact.id).gte("date", since).order("date", { ascending: false }),
  ]);
  const child = ch as KidsChild | null;
  const members = (mem ?? []) as KidsMember[];
  const attendance = (att ?? []) as KidsAttendance[];
  const { data: gr } = members.length ? await supabase.from("kids_groups").select("*").in("id", members.map((m) => m.group_id)) : { data: [] };
  const groups = new Map(((gr ?? []) as KidsGroup[]).map((g) => [g.id, g]));
  const rate = attendanceRate(attendance);
  const years = age(contact.birth_date);
  const parentPhone = child?.parent1_phone ?? contact.phone;
  const wa = waLink(parentPhone, `Bonjour, ici l'équipe Moov'Up Kids au sujet de ${contact.full_name.split(" ")[0]}.`);

  const perm = (ok: boolean | undefined, label: string) => (
    <span className={cn("inline-flex items-center gap-1 text-[13px]", ok ? "text-emerald-700" : "text-red-600")}>
      {ok ? <Check className="size-3.5" /> : <Minus className="size-3.5" />} {label}
    </span>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader title="Parents et autorisations" subtitle={child ? `Mise à jour le ${fmtDate(child.updated_at)}` : "À remplir à l'inscription"} icon={<Users />} />
        <ActionForm action={saveChild.bind(null, contact.id)} className="space-y-4 px-5 pb-5">
          {[1, 2].map((n) => {
            const k = n === 1 ? "parent1" : "parent2";
            return (
              <div key={n} className="grid gap-3 sm:grid-cols-[1fr_1fr_130px] [&>*]:min-w-0">
                <Field label={n === 1 ? "Parent principal" : "Second contact"}>
                  <Input name={`${k}_name`} defaultValue={(n === 1 ? (child?.parent1_name ?? contact.guardian_name) : child?.parent2_name) ?? ""} required={n === 1} placeholder="Nom complet" />
                </Field>
                <Field label="Téléphone">
                  <Input name={`${k}_phone`} type="tel" defaultValue={(n === 1 ? (child?.parent1_phone ?? contact.phone) : child?.parent2_phone) ?? ""} required={n === 1} placeholder="06…" />
                </Field>
                <Field label="Lien">
                  <Select name={`${k}_relation`} defaultValue={(n === 1 ? child?.parent1_relation : child?.parent2_relation) ?? (n === 1 ? "Mère" : "")}>
                    <option value="">—</option>
                    {RELATIONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            );
          })}
          <fieldset className="space-y-2 rounded-lg border border-line px-4 py-3">
            <legend className="px-1 text-[13px] font-medium text-slate-700">Autorisations</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="allow_leave_alone" defaultChecked={child?.allow_leave_alone ?? false} className="size-4" /> Peut repartir seul(e)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="allow_photos" defaultChecked={child?.allow_photos ?? false} className="size-4" /> Photos et vidéos autorisées
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="allow_medical" defaultChecked={child?.allow_medical ?? true} className="size-4" /> Intervention médicale d&apos;urgence autorisée
            </label>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Personnes autorisées à récupérer l'enfant">
              <Input name="pickup_names" defaultValue={child?.pickup_names ?? ""} placeholder="Ex. grand-mère, nounou" />
            </Field>
            <Field label="Informations utiles" hint="Allergie, asthme, lunettes…">
              <Input name="health_notes" defaultValue={child?.health_notes ?? ""} />
            </Field>
          </div>
          <SubmitButton variant="brand">Enregistrer</SubmitButton>
        </ActionForm>
      </Card>

      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-muted">Présence sur 4 semaines</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{rate === null ? "–" : `${rate} %`}</p>
              <p className="text-xs text-muted">
                {attendance.filter((a) => a.status === "present").length} présence(s) · {attendance.filter((a) => a.status === "absent").length} absence(s)
                {years !== null && ` · ${years} ans`}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "h-8")}>
                  <WhatsAppIcon className="size-4 text-emerald-600" /> Parent
                </a>
              )}
              <Link href={`/kids/parent/${contact.id}`} className="text-[13px] font-medium text-brand-600 hover:underline">
                Fiche famille
              </Link>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
            {perm(child?.allow_leave_alone, "Sortie seul(e)")}
            {perm(child?.allow_photos, "Photos")}
            {perm(child?.allow_medical ?? true, "Urgence médicale")}
          </div>
          {child?.health_notes && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{child.health_notes}</p>}
        </Card>

        <Card>
          <CardHeader title="Groupes" action={<Link href="/kids?v=groupes">Tous les groupes</Link>} />
          {members.length ? (
            <ul className="divide-y divide-line">
              {members.map((m) => {
                const g = groups.get(m.group_id);
                if (!g) return null;
                const r = attendanceRate(attendance.filter((a) => a.group_id === g.id));
                return (
                  <li key={m.id}>
                    <Link href={`/kids/groupes/${g.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/70">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{g.name}</p>
                        <p className="truncate text-xs text-muted">
                          {daysLabel(g.days)} · {g.start_time}–{g.end_time}
                        </p>
                      </div>
                      {m.status === "attente" ? <Badge tone="amber">Liste d&apos;attente</Badge> : <span className="text-sm font-semibold tabular-nums text-ink">{r === null ? "–" : `${r} %`}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={<Users />} title="Inscrit dans aucun groupe" action={<Link href="/kids?v=groupes" className={buttonClass("secondary")}>Choisir un groupe</Link>} />
          )}
        </Card>
      </div>
    </div>
  );
}
