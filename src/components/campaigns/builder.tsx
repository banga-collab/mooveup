"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlarmClock,
  CalendarClock,
  Check,
  FileText,
  Hourglass,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
  Variable,
} from "lucide-react";
import { countSegment, saveCampaign } from "@/actions/campaigns";
import type { FormState } from "@/components/action-form";
import { Card, Field, Input, buttonClass } from "@/components/ui";
import type { CampaignChannel, CampaignSegment, ContactStatus } from "@/lib/types";
import { CONTACT_STATUS_LABEL, cn } from "@/lib/utils";
import { CHANNEL_META, TEMPLATES, firstName, personalize } from "./shared";
import { ChannelIcon, MessageBubble } from "./channel";

type Ent = { id: string; short: string; color: string; soft: string };

export type BuilderInitial = { name: string; channel: CampaignChannel; message: string; segment: CampaignSegment };

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-2.5">
        <span className="mt-0.5 text-slate-400 [&_svg]:size-4">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Chip({ on, onClick, children, color }: { on: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
        on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:border-slate-300",
      )}
    >
      {on ? <Check className="size-3.5" strokeWidth={2.5} /> : color ? <span className="size-2 rounded-full" style={{ background: color }} /> : null}
      {children}
    </button>
  );
}

function DaysRule({ icon, label, on, days, setOn, setDays }: { icon: ReactNode; label: [string, string]; on: boolean; days: number; setOn: (v: boolean) => void; setDays: (n: number) => void }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 transition", on ? "border-brand-200 bg-brand-50/50" : "border-line bg-white")}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4 shrink-0" />
        <span className={cn("shrink-0", on ? "text-brand-500" : "text-slate-400")}>{icon}</span>
        <span className="text-[13px] font-medium text-slate-700">{label[0]}</span>
      </label>
      <span className="flex items-center gap-1.5 text-sm text-slate-600">
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          disabled={!on}
          onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
          aria-label={`${label[0]} (${label[1]})`}
          className="h-9 w-16 rounded-lg border border-line bg-white px-2 text-center text-sm font-semibold tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 disabled:opacity-50"
        />
        {label[1]}
      </span>
    </div>
  );
}

export function CampaignBuilder({ entities, defaultEntityIds, tags, initial, today }: { entities: Ent[]; defaultEntityIds: string[]; tags: string[]; initial?: BuilderInitial; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCampaign, undefined);

  const [name, setName] = useState(initial?.name ?? "");
  const [channel, setChannel] = useState<CampaignChannel>(initial?.channel ?? "whatsapp");
  const [message, setMessage] = useState(initial?.message ?? "");
  const [ents, setEnts] = useState<string[]>(initial?.segment.entity_ids.length ? initial.segment.entity_ids : defaultEntityIds);
  const [statuses, setStatuses] = useState<ContactStatus[]>(initial?.segment.statuses ?? ["client"]);
  const [sex, setSex] = useState<"H" | "F" | null>(initial?.segment.sex ?? null);
  const [chosenTags, setChosenTags] = useState<string[]>(initial?.segment.tags ?? []);
  const [expOn, setExpOn] = useState(Boolean(initial?.segment.expiring_days));
  const [expDays, setExpDays] = useState(initial?.segment.expiring_days ?? 10);
  const [inaOn, setInaOn] = useState(Boolean(initial?.segment.inactive_days));
  const [inaDays, setInaDays] = useState(initial?.segment.inactive_days ?? 60);
  const [schedule, setSchedule] = useState(false);
  const [count, setCount] = useState<{ n: number; sample: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const area = useRef<HTMLTextAreaElement>(null);

  const segment: CampaignSegment = useMemo(
    () => ({
      entity_ids: ents as CampaignSegment["entity_ids"],
      statuses,
      tags: chosenTags,
      expiring_days: expOn ? expDays : null,
      inactive_days: inaOn ? inaDays : null,
      sex,
    }),
    [ents, statuses, chosenTags, expOn, expDays, inaOn, inaDays, sex],
  );
  const segmentJson = JSON.stringify(segment);

  // Compteur de destinataires en direct
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      countSegment(JSON.parse(segmentJson), channel)
        .then((r) => alive && setCount({ n: r.count, sample: r.sample }))
        .catch(() => alive && setCount(null))
        .finally(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [segmentJson, channel]);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const insert = (token: string) => {
    const el = area.current;
    if (!el) return setMessage((m) => m + token);
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setMessage(t.message);
    if (!name.trim()) setName(t.name);
    if (t.segment?.statuses) setStatuses(t.segment.statuses);
    if (t.segment && "expiring_days" in t.segment) {
      setExpOn(Boolean(t.segment.expiring_days));
      if (t.segment.expiring_days) setExpDays(t.segment.expiring_days);
    }
    if (t.segment && "inactive_days" in t.segment) {
      setInaOn(Boolean(t.segment.inactive_days));
      if (t.segment.inactive_days) setInaDays(t.segment.inactive_days);
    }
  };

  const firstEnt = entities.find((e) => ents.includes(e.id)) ?? entities[0];
  const previewName = count?.sample[0] ? firstName(count.sample[0]) : "Salma";
  const preview = personalize(message, previewName, firstEnt?.short ?? "Moov'Up");
  const n = count?.n ?? 0;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
      <input type="hidden" name="segment" value={segmentJson} />
      <input type="hidden" name="channel" value={channel} />

      <div className="space-y-5">
        {state?.error && (
          <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
          </p>
        )}

        <Section icon={<FileText />} title="Campagne" hint="Un nom pour la retrouver et le canal d'envoi">
          <Field label="Nom de la campagne">
            <Input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Ex. Renouvellement de décembre" />
          </Field>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            {(Object.keys(CHANNEL_META) as CampaignChannel[]).map((c) => {
              const m = CHANNEL_META[c];
              const on = channel === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  aria-pressed={on}
                  className={cn(
                    "flex h-11 items-center justify-center gap-2 rounded-lg border px-2 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                    on ? "border-brand-500 bg-brand-50 text-ink ring-1 ring-brand-500" : "border-line bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  <ChannelIcon channel={c} className="size-4" style={{ color: on ? m.color : undefined }} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section icon={<Users />} title="Destinataires" hint="Le nombre de personnes ciblées se met à jour en direct">
          <p className="mb-2 text-[13px] font-medium text-slate-700">Établissements</p>
          <div className="flex flex-wrap gap-2">
            {entities.map((e) => (
              <Chip key={e.id} on={ents.includes(e.id)} color={e.color} onClick={() => setEnts(toggle(ents, e.id))}>
                {e.short}
              </Chip>
            ))}
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
            <div>
              <p className="mb-2 text-[13px] font-medium text-slate-700">Statut du contact</p>
              <div className="flex flex-wrap gap-2">
                {(["client", "prospect", "ancien"] as ContactStatus[]).map((s) => (
                  <Chip key={s} on={statuses.includes(s)} onClick={() => setStatuses(toggle(statuses, s))}>
                    {CONTACT_STATUS_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium text-slate-700">Sexe</p>
              <div className="flex flex-wrap gap-2">
                <Chip on={sex === null} onClick={() => setSex(null)}>
                  Tous
                </Chip>
                <Chip on={sex === "F"} onClick={() => setSex("F")}>
                  Femmes
                </Chip>
                <Chip on={sex === "H"} onClick={() => setSex("H")}>
                  Hommes
                </Chip>
              </div>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
                <Tag className="size-3.5 text-slate-400" /> Tags (au moins un)
              </p>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <Chip key={t} on={chosenTags.includes(t)} onClick={() => setChosenTags(toggle(chosenTags, t))}>
                    {t}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 space-y-2.5">
            <DaysRule icon={<AlarmClock className="size-4" />} label={["Abonnement qui se termine dans", "jours"]} on={expOn} days={expDays} setOn={setExpOn} setDays={setExpDays} />
            <DaysRule icon={<Hourglass className="size-4" />} label={["Sans achat ni visite depuis", "jours"]} on={inaOn} days={inaDays} setOn={setInaOn} setDays={setInaDays} />
          </div>

          {channel === "whatsapp" && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> WhatsApp : seuls les contacts qui ont accepté de recevoir des messages sont inclus.
            </p>
          )}
        </Section>

        <Section icon={<Sparkles />} title="Message" hint="Partez d'un modèle puis personnalisez">
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className={buttonClass("secondary", "h-9 px-3")}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
              <Variable className="size-3.5" /> Insérer :
            </span>
            {[
              ["{prenom}", "Prénom"],
              ["{etablissement}", "Établissement"],
            ].map(([token, label]) => (
              <button
                key={token}
                type="button"
                onClick={() => insert(token!)}
                className="h-8 rounded-md bg-slate-100 px-2.5 font-mono text-xs font-medium text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                title={`Insérer ${label}`}
              >
                {token}
              </button>
            ))}
          </div>
          <textarea
            ref={area}
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={1500}
            rows={6}
            placeholder="Bonjour {prenom}, …"
            aria-label="Message"
            className="mt-3 min-h-[140px] w-full resize-y rounded-lg border border-line bg-white px-3.5 py-3 text-sm text-ink placeholder:text-slate-400 transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
          />
          <p className="mt-1 text-right text-xs tabular-nums text-muted">
            {message.length} caractère{message.length > 1 ? "s" : ""}
            {channel === "sms" && message.length > 160 ? ` · ${Math.ceil(message.length / 153)} SMS` : ""}
          </p>
        </Section>
      </div>

      <div>
        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="p-4" aria-live="polite">
            <p className="flex items-center justify-between text-[13px] text-muted">
              Destinataires
              <Users className="size-4 text-slate-300" />
            </p>
            <p className="mt-2 flex items-center gap-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-ink">
              {count ? n : "–"}
              {loading && <Loader2 className="size-4 animate-spin text-slate-400" />}
            </p>
            <p className="mt-2 truncate text-xs text-muted">
              {ents.length === 0 ? "Choisissez au moins un établissement" : count?.sample.length ? `${count.sample.join(", ")}${n > count.sample.length ? "…" : ""}` : "Aucun contact ne correspond"}
            </p>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-[13px] font-medium text-muted">Aperçu</p>
            <MessageBubble channel={channel} text={preview} sender={firstEnt?.short ?? "Moov'Up"} />
          </Card>

          <Card className="space-y-2.5 p-4">
            <button type="submit" name="intent" value="brouillon" disabled={pending} className={buttonClass("secondary", "w-full")}>
              <FileText /> Enregistrer en brouillon
            </button>

            {schedule ? (
              <div className="space-y-2.5 rounded-lg border border-line bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Date">
                    <Input type="date" name="date" min={today} defaultValue={today} required />
                  </Field>
                  <Field label="Heure">
                    <Input type="time" name="time" defaultValue="10:00" required />
                  </Field>
                </div>
                <button type="submit" name="intent" value="programmer" disabled={pending} className={buttonClass("brand", "w-full")}>
                  <CalendarClock /> Confirmer la programmation
                </button>
                <button type="button" onClick={() => setSchedule(false)} className="h-8 w-full rounded-md text-xs font-medium text-muted hover:text-ink">
                  Annuler
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setSchedule(true)} className={buttonClass("secondary", "w-full")}>
                <CalendarClock /> Programmer…
              </button>
            )}

            <button
              type="submit"
              name="intent"
              value="envoyer"
              disabled={pending || !n}
              onClick={(e) => {
                if (!confirm(`Envoyer cette campagne à ${n} destinataire${n > 1 ? "s" : ""} maintenant ?`)) e.preventDefault();
              }}
              className={buttonClass("brand", "w-full")}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Send />} Envoyer maintenant
            </button>
            <p className="text-center text-xs leading-snug text-muted">L&apos;envoi est noté dans l&apos;historique de chaque client.</p>
          </Card>
        </div>
      </div>
    </form>
  );
}
