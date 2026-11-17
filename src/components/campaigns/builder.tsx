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
import { EntityIcon } from "@/components/entity-icon";
import type { CampaignChannel, CampaignSegment, ContactStatus } from "@/lib/types";
import { CONTACT_STATUS_LABEL, cn } from "@/lib/utils";
import { CHANNEL_META, TEMPLATES, firstName, personalize } from "./shared";
import { ChannelIcon, MessageBubble } from "./channel";

type Ent = { id: string; short: string; color: string; soft: string };

export type BuilderInitial = { name: string; channel: CampaignChannel; message: string; segment: CampaignSegment };

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-500">{icon}</span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
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
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition active:scale-95",
        on ? "border-transparent text-white shadow-sm" : "border-line bg-white text-slate-600 hover:border-slate-300",
      )}
      style={on ? { background: color ?? "#1a6d8e" } : undefined}
    >
      {on && <Check className="size-3.5" strokeWidth={3} />}
      {children}
    </button>
  );
}

function DaysRule({ icon, label, on, days, setOn, setDays }: { icon: ReactNode; label: [string, string]; on: boolean; days: number; setOn: (v: boolean) => void; setDays: (n: number) => void }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 transition", on ? "border-brand-200 bg-brand-50/60" : "border-line bg-white")}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4 shrink-0 accent-[#1a6d8e]" />
        <span className={cn("shrink-0", on ? "text-brand-500" : "text-slate-400")}>{icon}</span>
        <span className="text-sm font-medium text-slate-700">{label[0]}</span>
      </label>
      <span className="flex items-center gap-1.5 text-sm text-slate-600">
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          disabled={!on}
          onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
          className="h-9 w-16 rounded-lg border border-line bg-white px-2 text-center text-sm font-bold disabled:opacity-50"
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
          <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
          </p>
        )}

        <Section icon={<FileText className="size-4" />} title="Campagne" hint="Un nom pour la retrouver et le canal d'envoi">
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
                  className={cn("flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-sm font-bold transition", on ? "shadow-sm" : "border-line bg-white text-slate-500 hover:border-slate-300")}
                  style={on ? { borderColor: m.color, background: m.soft, color: m.color } : undefined}
                >
                  <ChannelIcon channel={c} className="size-6" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section icon={<Users className="size-4" />} title="Destinataires" hint="Le nombre de personnes ciblées se met à jour en direct">
          <p className="mb-2 text-xs font-semibold text-slate-600">Établissements</p>
          <div className="flex flex-wrap gap-2">
            {entities.map((e) => (
              <Chip key={e.id} on={ents.includes(e.id)} color={e.color} onClick={() => setEnts(toggle(ents, e.id))}>
                {!ents.includes(e.id) && <EntityIcon id={e.id} className="size-3.5" style={{ color: e.color }} />}
                {e.short}
              </Chip>
            ))}
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">Statut du contact</p>
              <div className="flex flex-wrap gap-2">
                {(["client", "prospect", "ancien"] as ContactStatus[]).map((s) => (
                  <Chip key={s} on={statuses.includes(s)} onClick={() => setStatuses(toggle(statuses, s))}>
                    {CONTACT_STATUS_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">Sexe</p>
              <div className="flex flex-wrap gap-2">
                <Chip on={sex === null} onClick={() => setSex(null)}>
                  Tous
                </Chip>
                <Chip on={sex === "F"} color="#d9467a" onClick={() => setSex("F")}>
                  Femmes
                </Chip>
                <Chip on={sex === "H"} color="#334155" onClick={() => setSex("H")}>
                  Hommes
                </Chip>
              </div>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Tag className="size-3.5" /> Tags (au moins un)
              </p>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <Chip key={t} on={chosenTags.includes(t)} color="#e8782a" onClick={() => setChosenTags(toggle(chosenTags, t))}>
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
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" /> WhatsApp : seuls les contacts qui ont accepté de recevoir des messages sont inclus.
            </p>
          )}
        </Section>

        <Section icon={<Sparkles className="size-4" />} title="Message" hint="Partez d'un modèle puis personnalisez">
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 text-[13px] font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700"
              >
                <span aria-hidden>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
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
                className="rounded-lg bg-brand-50 px-2.5 py-1 font-mono text-xs font-bold text-brand-600 ring-1 ring-inset ring-brand-100 transition hover:bg-brand-100"
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
            className="mt-3 min-h-[140px] w-full resize-y rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink placeholder:text-slate-400 transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50"
          />
          <p className="mt-1 text-right text-xs text-muted">
            {message.length} caractère{message.length > 1 ? "s" : ""}
            {channel === "sms" && message.length > 160 ? ` · ${Math.ceil(message.length / 153)} SMS` : ""}
          </p>
        </Section>
      </div>

      <div>
        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 p-5 text-white shadow-xl shadow-brand-700/25">
            <Users className="pointer-events-none absolute -bottom-6 -right-6 size-36 text-white/10" />
            <p className="text-sm font-bold uppercase tracking-wide text-white/90">Destinataires</p>
            <p className="mt-2 flex items-center gap-3 font-display text-[44px] font-extrabold leading-none">
              {count ? n : "–"}
              {loading && <Loader2 className="size-6 animate-spin text-white/70" />}
            </p>
            <p className="mt-2 truncate text-xs text-white/80">
              {ents.length === 0 ? "Choisissez au moins un établissement" : count?.sample.length ? `${count.sample.join(", ")}${n > count.sample.length ? "…" : ""}` : "Aucun contact ne correspond"}
            </p>
          </div>

          <Card className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Aperçu</p>
            <MessageBubble channel={channel} text={preview} sender={firstEnt?.short ?? "Moov'Up"} />
          </Card>

          <Card className="space-y-2.5 p-4">
            <button type="submit" name="intent" value="brouillon" disabled={pending} className={buttonClass("secondary", "w-full")}>
              <FileText className="size-4" /> Enregistrer en brouillon
            </button>

            {schedule ? (
              <div className="space-y-2.5 rounded-xl border border-accent-200 bg-accent-50/60 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Date">
                    <Input type="date" name="date" min={today} defaultValue={today} required />
                  </Field>
                  <Field label="Heure">
                    <Input type="time" name="time" defaultValue="10:00" required />
                  </Field>
                </div>
                <button type="submit" name="intent" value="programmer" disabled={pending} className={buttonClass("brand", "w-full")}>
                  <CalendarClock className="size-4" /> Confirmer la programmation
                </button>
                <button type="button" onClick={() => setSchedule(false)} className="w-full text-xs font-semibold text-muted hover:text-ink">
                  Annuler
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setSchedule(true)} className={buttonClass("brand", "w-full")}>
                <CalendarClock className="size-4" /> Programmer…
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
              className={buttonClass("primary", "w-full")}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Envoyer maintenant
            </button>
            <p className="text-center text-[11px] leading-snug text-muted">L&apos;envoi est enregistré dans l&apos;historique de chaque client. Les liens WhatsApp individuels sont ensuite disponibles sur la fiche de la campagne.</p>
          </Card>
        </div>
      </div>
    </form>
  );
}
