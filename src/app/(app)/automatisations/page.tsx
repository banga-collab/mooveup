import Link from "next/link";
import { ContactLink } from "@/components/quick-view/contact-link";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { NoResults, ResultCount, clearHref, entityFilter } from "@/components/reports/list-kit";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarClock, MessageCircle, Play, Send, Zap } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import type { Contact } from "@/lib/types";
import type { MessageLog, MessageStatus } from "@/lib/types-loyalty";
import { addDaysKey, cn, dayKey, fmtDate, fmtTime, waLink } from "@/lib/utils";
import { loadRules, pendingCounts } from "@/lib/automations";
import { whatsappMode } from "@/lib/whatsapp";
import { SolidTile } from "@/components/stat-tile";
import { Badge, Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { RuleEditor } from "@/components/automations/rule-editor";
import { automationDef } from "@/components/automations/defs";
import { runNow, toggleRule } from "@/actions/automations";

export const metadata = { title: "Rappels automatiques" };

const STATUS: Record<MessageStatus, { label: string; tone: "green" | "gray" | "red" }> = {
  envoye: { label: "Envoyé", tone: "green" },
  simule: { label: "Simulé", tone: "gray" },
  echec: { label: "Échec", tone: "red" },
};

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role === "staff") redirect("/");
  const supabase = await createClient();
  const statutRaw = (Array.isArray(sp.statut) ? sp.statut[0] : sp.statut) as MessageStatus | undefined;
  const statut = statutRaw && statutRaw in STATUS ? statutRaw : undefined;

  const since7 = addDaysKey(dayKey(), -7);
  const [settings, rules, { data: logRows }] = await Promise.all([
    getSettings(),
    loadRules(supabase),
    supabase.from("message_log").select("*").in("entity_id", scope.ids).gte("day_key", addDaysKey(dayKey(), -30)).order("created_at", { ascending: false }),
  ]);
  const pending = await pendingCounts(supabase, scope.ids, rules.filter((r) => r.enabled));
  const logs = (logRows ?? []) as MessageLog[];
  const week = logs.filter((l) => String(l.day_key) >= since7);
  const sent7 = week.filter((l) => l.status !== "echec").length;
  const failed7 = week.filter((l) => l.status === "echec").length;
  const pendingTotal = Object.values(pending).reduce((a, n) => a + (n ?? 0), 0);

  const ids = [...new Set(logs.map((l) => l.contact_id).filter((x): x is string => !!x))];
  const { data: cRows } = ids.length ? await supabase.from("contacts").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map(((cRows ?? []) as Pick<Contact, "id" | "full_name">[]).map((c) => [c.id, c.full_name]));

  // Recherche (client, téléphone, message, règle) + filtres statut / règle / établissement
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q).trim();
  const ents = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const etab = ents.some((e) => e.id === one(sp.etab)) ? one(sp.etab) : "";
  const ruleKeys: string[] = [...new Set(logs.map((l) => l.rule_key ?? ""))];
  const regle = ruleKeys.includes(one(sp.regle)) && one(sp.regle) ? one(sp.regle) : "";
  const matched = logs.filter(
    (l) =>
      (!statut || l.status === statut) &&
      (!etab || l.entity_id === etab) &&
      (!regle || l.rule_key === regle) &&
      matchesQuery(q, l.contact_id ? names.get(l.contact_id) : null, l.phone, l.body, automationDef(l.rule_key)?.label, l.error),
  );
  const filtering = !!(q || statut || etab || regle);
  const shown = matched.slice(0, filtering ? 200 : 40);

  const mode = whatsappMode(settings);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rappels automatiques"
        subtitle="Messages WhatsApp envoyés au bon moment, une seule fois par client et par jour"
        actions={
          <ActionForm action={runNow}>
            <SubmitButton variant="brand" pendingText="Envoi en cours…">
              <Play className="size-4" /> Exécuter maintenant
            </SubmitButton>
          </ActionForm>
        }
      />

      <div className={cn("flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px]", mode === "api" ? "border-line bg-white text-slate-600" : "border-amber-200 bg-amber-50/60 text-amber-800")}>
        <MessageCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          {mode === "api" && "Connecté à WhatsApp Business : les messages partent automatiquement."}
          {mode === "demo" && "Mode démo : les envois sont simulés et journalisés, rien n'est réellement envoyé."}
          {mode === "lien" && "WhatsApp Business n'est pas connecté : les messages sont préparés et s'envoient en un clic depuis « Derniers envois »."}{" "}
          {mode !== "api" && me.role === "direction" && (
            <Link href="/parametres" className="font-medium underline underline-offset-2">
              Connecter WhatsApp
            </Link>
          )}
          <span className="mt-1 block text-xs opacity-80">Envoi planifié : appelez /api/cron?secret=… toutes les heures (rappels de la veille à 18 h, rien entre 21 h et 8 h).</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        <SolidTile label="À envoyer aujourd'hui" value={pendingTotal} sub={pendingTotal ? "Cliquez sur « Exécuter maintenant »" : "Tout est à jour"} icon={<CalendarClock />} />
        <SolidTile label="Messages sur 7 jours" value={sent7} sub={`${week.filter((l) => l.status === "envoye").length} envoyés via l'API`} icon={<Send />} />
        <SolidTile label="Échecs sur 7 jours" value={failed7} sub={failed7 ? "Numéros à vérifier" : "Aucun échec"} icon={<AlertTriangle />} href={failed7 ? "/automatisations?statut=echec#envois" : undefined} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Règles" subtitle="Activez une règle et adaptez son message" icon={<Zap />} />
        <ul className="divide-y divide-line border-t border-line">
          {rules.map((r) => (
            <li key={r.key} className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start gap-3">
                <form action={toggleRule} className="pt-0.5">
                  <input type="hidden" name="key" value={r.key} />
                  <input type="hidden" name="enabled" value={r.enabled ? "0" : "1"} />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={r.enabled}
                    aria-label={r.enabled ? `Désactiver « ${r.label} »` : `Activer « ${r.label} »`}
                    className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition", r.enabled ? "bg-brand-500" : "bg-slate-200")}
                  >
                    <span className={cn("size-4 rounded-full bg-white shadow-sm transition", r.enabled ? "translate-x-[18px]" : "translate-x-0.5")} />
                  </button>
                </form>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("text-sm font-medium", r.enabled ? "text-ink" : "text-slate-500")}>{r.label}</p>
                    {r.enabled && (pending[r.key] ?? 0) > 0 && <Badge tone="brand">{pending[r.key]} aujourd&apos;hui</Badge>}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {r.audience} · {r.timing}
                  </p>
                  <details className="group mt-2 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="cursor-pointer list-none text-[13px] text-slate-600 hover:text-ink">
                      <span className="line-clamp-1 group-open:hidden">« {r.message} »</span>
                      <span className="hidden font-medium text-brand-600 group-open:inline">Fermer</span>
                    </summary>
                    <div className="mt-3">
                      <RuleEditor ruleKey={r.key} message={r.message} defaultMessage={r.defaultMessage} vars={r.vars} />
                    </div>
                  </details>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <section id="envois" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Derniers envois</h2>
          <ResultCount shown={matched.length} total={logs.length} filtered={filtering} unit="message" />
        </div>
        {logs.length > 0 && (
          <ListToolbar
            placeholder="Client, téléphone, message…"
            className="mb-0"
            filters={[
              { param: "statut", label: "Tous", options: (Object.keys(STATUS) as MessageStatus[]).map((k) => ({ value: k, label: `${STATUS[k].label}s`, count: logs.filter((l) => l.status === k).length })) },
              { param: "regle", label: "Toutes les règles", options: ruleKeys.filter(Boolean).map((k) => ({ value: k, label: automationDef(k)?.label ?? k })) },
              ...entityFilter(ents),
            ]}
          />
        )}
        <Card className="overflow-hidden">
          {shown.length ? (
            <ul className="divide-y divide-line">
              {shown.map((l) => {
                const link = l.status !== "envoye" ? waLink(l.phone, l.body) : null;
                const name = l.contact_id ? names.get(l.contact_id) : null;
                return (
                  <li key={l.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {name && l.contact_id ? (
                          <ContactLink id={l.contact_id} name={name} className="text-sm" />
                        ) : (
                          <span className="text-sm font-medium text-ink">{l.phone ?? "Client"}</span>
                        )}
                        <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
                        <span className="text-xs text-muted">{automationDef(l.rule_key)?.label ?? "Message manuel"}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] text-slate-600">{l.body}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>
                          {fmtDate(l.created_at, { day: "numeric", month: "short" })} à {fmtTime(l.created_at)}
                        </span>
                        {l.entity_id && <EntityBadge id={l.entity_id} />}
                        {l.error && <span className="text-red-600">{l.error}</span>}
                      </p>
                    </div>
                    {link && (
                      <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] font-medium text-slate-600 hover:border-slate-300 hover:text-ink">
                        <Send className="size-3.5" /> <span className="hidden sm:inline">{l.status === "echec" ? "Réessayer" : "Envoyer"}</span>
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : filtering && logs.length ? (
            <NoResults q={q} href={clearHref("/automatisations", sp, ["q", "statut", "etab", "regle"])} what="message" />
          ) : (
            <Empty icon={<Send />} title="Aucun envoi" text="Les messages envoyés par les règles actives apparaîtront ici." />
          )}
        </Card>
      </section>
    </div>
  );
}
