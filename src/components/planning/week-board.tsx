"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Shift, ShiftKind } from "@/lib/types-ops";
import type { PlanState } from "@/actions/planning";
import { Avatar, Button, Card, Field, Input, Select, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { fmtHours, hhmm, shiftMinutes } from "./lib";

type Ent = { id: string; short: string; color: string; soft: string };
type Member = { id: string; name: string; job: string | null; entityIds: string[] };
type DayInfo = { key: string; short: string; num: string; long: string; today: boolean };
type Editor = { token: string; date: string; profileId: string | null; shift: Shift | null };

const DEFAULT_SLOTS: [string, string][] = [
  ["09:00", "17:00"],
  ["08:00", "14:00"],
  ["14:00", "21:00"],
];

export function WeekBoard({
  days,
  members,
  entities,
  shifts,
  canEdit,
  save,
  remove,
}: {
  days: DayInfo[];
  members: Member[];
  entities: Ent[];
  shifts: Shift[];
  canEdit: boolean;
  save: (state: PlanState, fd: FormData) => Promise<PlanState>;
  remove: (id: string) => Promise<void>;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [state, dispatch, pending] = useActionState(save, undefined);
  const ent = new Map(entities.map((e) => [e.id, e]));
  const cell = (pid: string, date: string) => shifts.filter((s) => s.profile_id === pid && s.date === date).sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
  const open = (date: string, profileId: string | null, shift: Shift | null = null) => {
    if (!canEdit) return;
    setEditor({ token: `${Date.now()}`, date, profileId, shift });
  };
  const showEditor = editor && state?.done !== editor.token;

  const chip = (s: Shift, withName?: string) => {
    const e = ent.get(s.entity_id);
    const body =
      s.kind === "travail" ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: e?.color ?? "#94a3b8" }} />
            <span className="font-medium tabular-nums text-ink">
              {hhmm(s.start_time)}–{hhmm(s.end_time)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted">{withName ?? e?.short}</span>
        </>
      ) : (
        <span className="font-medium">
          {s.kind === "repos" ? "Repos" : "Congé"}
          {withName && <span className="font-normal text-muted"> · {withName}</span>}
        </span>
      );
    const cls = cn(
      "block w-full min-w-0 rounded-md px-2 py-1.5 text-left text-xs transition",
      s.kind === "repos" && "bg-slate-50 text-slate-400",
      s.kind === "conge" && "bg-amber-50 text-amber-700",
      canEdit && "hover:ring-1 hover:ring-slate-300",
    );
    const style = s.kind === "travail" ? { background: e?.soft ?? "#f1f5f9" } : undefined;
    return canEdit ? (
      <button key={s.id} type="button" className={cls} style={style} onClick={() => open(s.date, s.profile_id, s)}>
        {body}
      </button>
    ) : (
      <div key={s.id} className={cls} style={style}>
        {body}
      </div>
    );
  };

  return (
    <>
      {/* Ordinateur : grille semaine × équipe */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="w-48 px-4 py-2.5 text-left text-xs font-medium text-muted">Équipe</th>
                {days.map((d) => (
                  <th key={d.key} className={cn("px-1.5 py-2.5 text-left text-xs font-medium", d.today ? "text-brand-600" : "text-muted")}>
                    <span className="capitalize">{d.short}</span> <span className="tabular-nums">{d.num}</span>
                  </th>
                ))}
                <th className="w-20 px-3 py-2.5 text-right text-xs font-medium text-muted">Heures</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const total = shifts.filter((s) => s.profile_id === m.id).reduce((a, s) => a + shiftMinutes(s), 0);
                return (
                  <tr key={m.id} className="border-t border-line align-top">
                    <td className="px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={m.name} size={28} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-ink">{m.name}</p>
                          <p className="truncate text-xs text-muted">{m.job ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    {days.map((d) => {
                      const list = cell(m.id, d.key);
                      return (
                        <td key={d.key} className={cn("group px-1 py-1.5", d.today && "bg-brand-50/40")}>
                          <div className="space-y-1">
                            {list.map((s) => chip(s))}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => open(d.key, m.id)}
                                aria-label={`Ajouter un créneau pour ${m.name}`}
                                className={cn(
                                  "grid w-full place-items-center rounded-md border border-dashed border-slate-200 text-slate-400 transition hover:border-brand-300 hover:text-brand-600",
                                  list.length ? "h-6 opacity-0 group-hover:opacity-100 focus:opacity-100" : "h-11",
                                )}
                              >
                                <Plus className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right text-[13px] font-semibold tabular-nums text-ink">{total ? fmtHours(total) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-slate-50/60 text-xs text-muted">
                <td className="px-4 py-2">Présents</td>
                {days.map((d) => (
                  <td key={d.key} className="px-2 py-2 tabular-nums">
                    {new Set(shifts.filter((s) => s.date === d.key && s.kind === "travail").map((s) => s.profile_id)).size}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Mobile : liste par jour */}
      <div className="space-y-3 md:hidden">
        {days.map((d) => {
          const today = shifts.filter((s) => s.date === d.key);
          const work = today.filter((s) => s.kind === "travail").sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
          const off = today.filter((s) => s.kind !== "travail");
          const name = (id: string) => members.find((m) => m.id === id)?.name ?? "—";
          return (
            <Card key={d.key} className={cn(d.today && "border-brand-200")}>
              <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
                <p className={cn("text-sm font-semibold capitalize", d.today ? "text-brand-600" : "text-ink")}>{d.long}</p>
                {canEdit && (
                  <button type="button" onClick={() => open(d.key, null)} className={buttonClass("ghost", "h-8 px-2")}>
                    <Plus /> Ajouter
                  </button>
                )}
              </div>
              <div className="space-y-1.5 px-3 pb-3">
                {work.length ? work.map((s) => chip(s, name(s.profile_id))) : <p className="px-1 text-[13px] text-muted">Personne de prévu.</p>}
                {off.length > 0 && <div className="grid grid-cols-2 gap-1.5 [&>*]:min-w-0">{off.map((s) => chip(s, name(s.profile_id)))}</div>}
              </div>
            </Card>
          );
        })}
      </div>

      {showEditor && (
        <ShiftEditor
          key={editor.token}
          editor={editor}
          day={days.find((d) => d.key === editor.date)!}
          members={members}
          entities={entities}
          weekShifts={shifts}
          error={state?.token === editor.token ? state.error : undefined}
          pending={pending}
          dispatch={dispatch}
          remove={remove}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

function ShiftEditor({
  editor,
  day,
  members,
  entities,
  weekShifts,
  error,
  pending,
  dispatch,
  remove,
  onClose,
}: {
  editor: Editor;
  day: DayInfo;
  members: Member[];
  entities: Ent[];
  weekShifts: Shift[];
  error?: string;
  pending: boolean;
  dispatch: (fd: FormData) => void;
  remove: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const s = editor.shift;
  const [pid, setPid] = useState(editor.profileId ?? members[0]?.id ?? "");
  const member = members.find((m) => m.id === pid);
  const options = entities.filter((e) => !member || !member.entityIds.length || member.entityIds.includes(e.id));
  const sameDay = weekShifts.find((x) => x.profile_id === pid && x.date === editor.date && x.kind === "travail");
  const defaultEntity = s?.entity_id ?? sameDay?.entity_id ?? options[0]?.id ?? entities[0]?.id ?? "";

  // Créneaux habituels de la personne cette semaine, puis créneaux types
  const usual = new Map<string, number>();
  for (const x of weekShifts) if (x.profile_id === pid && x.kind === "travail" && x.start_time && x.end_time) usual.set(`${hhmm(x.start_time)}-${hhmm(x.end_time)}`, (usual.get(`${hhmm(x.start_time)}-${hhmm(x.end_time)}`) ?? 0) + 1);
  const presets = [...new Set([...[...usual.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k), ...DEFAULT_SLOTS.map(([a, b]) => `${a}-${b}`)])].slice(0, 4);

  const submit = (kind: ShiftKind, start?: string, end?: string) => {
    if (!form.current) return;
    const fd = new FormData(form.current);
    fd.set("kind", kind);
    if (start && end) {
      fd.set("start_time", start);
      fd.set("end_time", end);
    }
    startTransition(() => dispatch(fd));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-t-xl border border-line bg-white p-5 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">{s ? "Modifier le créneau" : "Nouveau créneau"}</h3>
            <p className="mt-0.5 truncate text-[13px] capitalize text-muted">
              {day.long}
              {member && editor.profileId ? ` · ${member.name}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>

        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            submit("travail");
          }}
          className="space-y-3.5"
        >
          <input type="hidden" name="token" value={editor.token} />
          <input type="hidden" name="date" value={editor.date} />
          {s && <input type="hidden" name="id" value={s.id} />}
          {editor.profileId ? (
            <input type="hidden" name="profile_id" value={pid} />
          ) : (
            <Field label="Membre de l'équipe">
              <Select name="profile_id" value={pid} onChange={(e) => setPid(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {options.length > 1 ? (
            <Field label="Établissement">
              <Select key={pid} name="entity_id" defaultValue={defaultEntity}>
                {options.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.short}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="entity_id" value={defaultEntity} />
          )}

          {!s && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-slate-700">En un clic</p>
              <div className="grid grid-cols-2 gap-1.5">
                {presets.map((p) => {
                  const [a, b] = p.split("-") as [string, string];
                  return (
                    <button key={p} type="button" disabled={pending} onClick={() => submit("travail", a, b)} className={buttonClass("secondary", "tabular-nums")}>
                      {a} – {b}
                    </button>
                  );
                })}
                <button type="button" disabled={pending} onClick={() => submit("repos")} className={buttonClass("secondary")}>
                  Repos
                </button>
                <button type="button" disabled={pending} onClick={() => submit("conge")} className={buttonClass("secondary")}>
                  Congé
                </button>
              </div>
            </div>
          )}

          <div>
            {!s && <p className="mb-1.5 text-[13px] font-medium text-slate-700">Ou horaires précis</p>}
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 [&>*]:min-w-0">
              <Field label="Début">
                <Input type="time" name="start_time" defaultValue={hhmm(s?.start_time ?? null) || "09:00"} required />
              </Field>
              <Field label="Fin">
                <Input type="time" name="end_time" defaultValue={hhmm(s?.end_time ?? null) || "17:00"} required />
              </Field>
              <Button type="submit" variant="brand" className="h-10" disabled={pending}>
                {s ? "Enregistrer" : "Ajouter"}
              </Button>
            </div>
          </div>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}

          {s && (
            <div className="flex items-center justify-between gap-2 border-t border-line pt-3.5">
              {s.kind !== "travail" ? (
                <p className="text-[13px] text-muted">Actuellement : {s.kind === "repos" ? "repos" : "congé"}</p>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setDeleting(true);
                  startTransition(async () => {
                    await remove(s.id);
                    onClose();
                  });
                }}
                className={buttonClass("danger")}
              >
                <Trash2 /> Supprimer
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
