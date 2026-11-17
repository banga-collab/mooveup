import Link from "next/link";
import { AlarmClock, CalendarX2, CreditCard, Plus, RefreshCw, Repeat, Search, TrendingUp, X } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import { PAY_LABEL, SUB_STATUS_LABEL, addDaysKey, cn, dayKey, daysUntil, fmtDate, mad, madShort } from "@/lib/utils";
import type { CatalogItem, Contact, PayMethod, Subscription, SubscriptionStatus } from "@/lib/types";
import { renewSubscription } from "@/actions/subscriptions";
import { SolidTile } from "@/components/stat-tile";
import { Avatar, Badge, Card, Empty, Field, LinkButton, PageHeader, Select } from "@/components/ui";
import { EntityBadge, EntityMark } from "@/components/entity-icon";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Sheet } from "@/components/agenda/sheet";
import { SubscriptionActions } from "@/components/subscriptions/subscription-actions";

export const metadata = { title: "Abonnements" };

const STATUSES: SubscriptionStatus[] = ["actif", "suspendu", "expire", "resilie"];
const STATUS_TONE: Record<SubscriptionStatus, "green" | "amber" | "red" | "gray"> = { actif: "green", suspendu: "amber", expire: "red", resilie: "gray" };
const PAGE = 60;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const span = (a: string, b: string) => Math.max(1, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000));

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ statut?: string; filtre?: string; q?: string; n?: string; renouveler?: string }> }) {
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const month = today.slice(0, 7);
  const statut = STATUSES.includes(sp.statut as SubscriptionStatus) ? (sp.statut as SubscriptionStatus) : null;
  const soon = sp.filtre === "expire-bientot";
  const q = (sp.q ?? "").trim();
  const limit = Math.max(PAGE, Math.min(2000, Number(sp.n) || PAGE));

  const { data: subRows } = await supabase.from("subscriptions").select("*").in("entity_id", scope.ids).order("end_date");
  const all = (subRows ?? []) as Subscription[];
  const { data: contactRows } = await supabase.from("contacts").select("*").in("id", [...new Set(all.map((s) => s.contact_id))]);
  const contacts = byId(contactRows as Contact[]);

  /* Indicateurs */
  const actives = all.filter((s) => s.status === "actif");
  const isSoon = (s: Subscription) => {
    const d = daysUntil(s.end_date);
    return s.status === "actif" && d >= 0 && d <= 7;
  };
  const soonList = actives.filter(isSoon);
  const expiredMonth = all.filter((s) => (s.status === "expire" || s.status === "actif") && s.end_date.slice(0, 7) === month && s.end_date < today);
  const mrr = actives.reduce((sum, s) => sum + (Number(s.price_mad) / span(s.start_date, s.end_date)) * 30, 0);
  const autoCount = actives.filter((s) => s.auto_renew).length;
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((x) => x.status === s).length])) as Record<SubscriptionStatus, number>;

  /* Filtres */
  const needle = norm(q);
  const rank: Record<SubscriptionStatus, number> = { actif: 0, suspendu: 1, expire: 2, resilie: 3 };
  const filtered = all
    .filter((s) => (soon ? isSoon(s) : statut ? s.status === statut : true))
    .filter((s) => !needle || norm(contacts.get(s.contact_id)?.full_name ?? "").includes(needle))
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "actif" || a.status === "suspendu" ? a.end_date.localeCompare(b.end_date) : b.end_date.localeCompare(a.end_date)));
  const shown = filtered.slice(0, limit);

  const href = (o: { statut?: string | null; filtre?: string | null; q?: string | null; n?: number | null; renouveler?: string | null }) => {
    const p = new URLSearchParams();
    const st = o.statut === undefined ? statut : o.statut;
    const fi = o.filtre === undefined ? (soon ? "expire-bientot" : null) : o.filtre;
    const qq = o.q === undefined ? q : o.q;
    if (st) p.set("statut", st);
    if (fi) p.set("filtre", fi);
    if (qq) p.set("q", qq);
    if (o.n) p.set("n", String(o.n));
    else if (o.n === undefined && limit > PAGE) p.set("n", String(limit));
    if (o.renouveler) p.set("renouveler", o.renouveler);
    const s = p.toString();
    return `/abonnements${s ? `?${s}` : ""}`;
  };
  const listHref = href({});

  const chips: { label: string; active: boolean; to: string; n: number; tone?: string }[] = [
    { label: "Tous", active: !statut && !soon, to: href({ statut: null, filtre: null, n: null }), n: all.length },
    { label: "À renouveler", active: soon, to: href({ statut: null, filtre: "expire-bientot", n: null }), n: soonList.length, tone: "accent" },
    ...STATUSES.map((s) => ({ label: `${SUB_STATUS_LABEL[s]}s`, active: statut === s && !soon, to: href({ statut: s, filtre: null, n: null }), n: counts[s] })),
  ];

  /* Renouvellement demandé */
  const renewing = sp.renouveler ? all.find((s) => s.id === sp.renouveler && s.status !== "resilie") ?? null : null;
  let renewItem: CatalogItem | null = null;
  if (renewing?.item_id) {
    const { data } = await supabase.from("catalog_items").select("*").eq("id", renewing.item_id).maybeSingle();
    renewItem = data as CatalogItem | null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abonnements"
        subtitle={scope.current ? <b style={{ color: scope.current.color }}>{scope.current.name}</b> : `Abonnements et packs · ${scope.allowed.length} établissements`}
        actions={
          <LinkButton href="/abonnements/nouveau" className="h-11 rounded-2xl">
            <Plus className="size-4" /> Nouvel abonnement
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile tone="brand" href={href({ statut: "actif", filtre: null, q: null, n: null })} label="Abonnements actifs" value={actives.length} sub={`${autoCount} en renouvellement auto`} icon={<CreditCard />} watermark={<CreditCard />} />
        <SolidTile
          tone="accent"
          href={href({ statut: null, filtre: "expire-bientot", q: null, n: null })}
          label="À renouveler sous 7 j"
          value={soonList.length}
          sub={soonList.length ? `${mad(soonList.reduce((s, x) => s + Number(x.price_mad), 0))} à sécuriser` : "Rien d'urgent"}
          icon={<AlarmClock />}
          watermark={<AlarmClock />}
        />
        <SolidTile tone="violet" href={href({ statut: "expire", filtre: null, q: null, n: null })} label="Expirés ce mois" value={expiredMonth.length} sub="Clients à relancer" icon={<CalendarX2 />} watermark={<CalendarX2 />} />
        <SolidTile tone="green" label="Revenu mensuel récurrent" value={madShort(Math.round(mrr))} sub="Estimation sur les abonnements actifs" icon={<TrendingUp />} watermark={<TrendingUp />} />
      </div>

      {/* Filtres */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {chips.map((c) => (
            <Link
              key={c.label}
              href={c.to}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition",
                c.active ? (c.tone === "accent" ? "border-accent-500 bg-accent-500 text-white" : "border-brand-500 bg-brand-500 text-white") : "border-line bg-white text-slate-600 hover:border-brand-200",
              )}
            >
              {c.label}
              <span className={cn("rounded-full px-1.5 text-[11px] font-bold", c.active ? "bg-white/20" : "bg-canvas text-slate-500")}>{c.n}</span>
            </Link>
          ))}
        </div>
        <form action="/abonnements" className="relative w-full lg:max-w-xs">
          {statut && <input type="hidden" name="statut" value={statut} />}
          {soon && <input type="hidden" name="filtre" value="expire-bientot" />}
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher un client…"
            className="h-10 w-full rounded-xl border border-line bg-white pl-10 pr-10 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50"
          />
          {q && (
            <Link href={href({ q: null, n: null })} aria-label="Effacer la recherche" className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-canvas">
              <X className="size-4" />
            </Link>
          )}
        </form>
      </div>

      {shown.length === 0 ? (
        <Card>
          <Empty
            icon={<CreditCard className="size-6" />}
            title={q ? "Aucun abonnement pour cette recherche" : "Aucun abonnement"}
            text={soon ? "Aucun abonnement actif ne se termine dans les 7 prochains jours." : "Créez un abonnement ou un pack depuis cette page ou la fiche d'un client."}
            action={
              <LinkButton href="/abonnements/nouveau">
                <Plus className="size-4" /> Nouvel abonnement
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <>
          {/* Bureau : tableau */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas/60 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-5 py-3">Client</th>
                    <th className="px-3 py-3">Formule</th>
                    <th className="px-3 py-3">Période</th>
                    <th className="px-3 py-3">Reste</th>
                    <th className="px-3 py-3 text-right">Prix</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((s) => (
                    <tr key={s.id} className="align-middle transition hover:bg-canvas/50">
                      <td className="px-5 py-3">
                        <ClientCell sub={s} contact={contacts.get(s.contact_id)} />
                      </td>
                      <td className="max-w-[240px] px-3 py-3">
                        <p className="truncate font-semibold text-ink">{s.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <EntityBadge id={s.entity_id} />
                          {s.auto_renew && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600" title="Renouvellement automatique">
                              <Repeat className="size-3" /> Auto
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="w-[220px] px-3 py-3">
                        <Period sub={s} today={today} />
                      </td>
                      <td className="px-3 py-3">
                        <Remaining sub={s} />
                      </td>
                      <td className="px-3 py-3 text-right font-display font-extrabold text-ink">{mad(Number(s.price_mad))}</td>
                      <td className="px-5 py-3">
                        <SubscriptionActions sub={s} renewHref={href({ renouveler: s.id })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile : cartes */}
          <div className="space-y-3 md:hidden">
            {shown.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <ClientCell sub={s} contact={contacts.get(s.contact_id)} />
                  <span className="shrink-0 font-display font-extrabold text-ink">{mad(Number(s.price_mad))}</span>
                </div>
                <div className="mt-3 flex min-w-0 items-center gap-2.5">
                  <EntityMark id={s.entity_id} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <EntityBadge id={s.entity_id} />
                      {s.auto_renew && (
                        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-600">
                          <Repeat className="size-3" /> Auto
                        </span>
                      )}
                    </p>
                  </div>
                  <Remaining sub={s} />
                </div>
                <div className="mt-3">
                  <Period sub={s} today={today} />
                </div>
                <div className="mt-3 border-t border-line pt-3">
                  <SubscriptionActions sub={s} renewHref={href({ renouveler: s.id })} />
                </div>
              </Card>
            ))}
          </div>

          {filtered.length > shown.length && (
            <div className="flex justify-center">
              <LinkButton variant="secondary" href={href({ n: limit + PAGE })} scroll={false}>
                Afficher plus ({filtered.length - shown.length} restants)
              </LinkButton>
            </div>
          )}
        </>
      )}

      {renewing && (
        <RenewSheet sub={renewing} item={renewItem} contact={contacts.get(renewing.contact_id)} today={today} closeHref={href({ renouveler: null })} back={listHref} />
      )}
    </div>
  );
}

function ClientCell({ sub, contact }: { sub: Subscription; contact: Contact | undefined }) {
  const name = contact?.full_name ?? "Client";
  return (
    <Link href={`/contacts/${sub.contact_id}?tab=abonnements`} className="group flex min-w-0 items-center gap-2.5">
      <Avatar name={name} size={36} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink group-hover:text-brand-600">{name}</span>
        <span className="mt-0.5 block">
          <Badge tone={STATUS_TONE[sub.status]} dot>
            {SUB_STATUS_LABEL[sub.status]}
          </Badge>
        </span>
      </span>
    </Link>
  );
}

function Period({ sub, today }: { sub: Subscription; today: string }) {
  const total = span(sub.start_date, sub.end_date);
  const elapsed = today <= sub.start_date ? 0 : (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${sub.start_date}T00:00:00Z`)) / 86_400_000;
  const ratio = sub.status === "resilie" ? 1 : Math.min(1, elapsed / total);
  const d = daysUntil(sub.end_date);
  const color = sub.status !== "actif" ? "#94a3b8" : d < 0 ? "#dc2626" : d <= 7 ? "#e8782a" : "#10b981";
  return (
    <div className="min-w-0">
      <div className="flex justify-between gap-2 text-[11px] font-medium text-muted">
        <span>{fmtDate(`${sub.start_date}T12:00:00Z`, { day: "numeric", month: "short" })}</span>
        <span>{fmtDate(`${sub.end_date}T12:00:00Z`, { day: "numeric", month: "short", year: "2-digit" })}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(3, ratio * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function Remaining({ sub }: { sub: Subscription }) {
  const d = daysUntil(sub.end_date);
  const isPack = sub.sessions_left !== null;
  let label: string;
  let cls: string;
  if (sub.status === "resilie") {
    label = "Résilié";
    cls = "bg-slate-100 text-slate-500";
  } else if (d < 0) {
    label = `Fini il y a ${-d} j`;
    cls = "bg-red-50 text-red-600";
  } else if (d === 0) {
    label = "Fin aujourd'hui";
    cls = "bg-red-50 text-red-600";
  } else if (d <= 7) {
    label = `${d} j`;
    cls = d <= 2 ? "bg-red-50 text-red-600" : "bg-accent-50 text-accent-700";
  } else {
    label = `${d} j`;
    cls = sub.status === "suspendu" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
  }
  return (
    <div className="flex shrink-0 flex-col items-end gap-1 md:items-start">
      <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", cls)}>{label}</span>
      {isPack && (
        <span className={cn("whitespace-nowrap text-[11px] font-semibold", (sub.sessions_left ?? 0) <= 1 ? "text-accent-600" : "text-brand-600")}>
          {sub.sessions_left} séance{(sub.sessions_left ?? 0) > 1 ? "s" : ""} restante{(sub.sessions_left ?? 0) > 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

function RenewSheet({ sub, item, contact, today, closeHref, back }: { sub: Subscription; item: CatalogItem | null; contact: Contact | undefined; today: string; closeHref: string; back: string }) {
  const start = sub.end_date >= today ? sub.end_date : today;
  const days = item?.duration_days || span(sub.start_date, sub.end_date);
  const end = addDaysKey(start, days);
  const sessions = sub.sessions_left === null ? null : (item?.sessions_count ?? sub.sessions_left);
  return (
    <Sheet
      closeHref={closeHref}
      icon={
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-500 text-white shadow-lg shadow-accent-500/25">
          <RefreshCw className="size-5" />
        </span>
      }
      title="Renouveler l'abonnement"
      subtitle={`${contact?.full_name ?? "Client"} · ${sub.name}`}
    >
      <ActionForm action={renewSubscription.bind(null, sub.id)}>
        <input type="hidden" name="back" value={back} />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-line p-3">
            <p className="text-xs text-muted">Nouvelle période</p>
            <p className="mt-1 font-semibold text-ink">
              {fmtDate(`${start}T12:00:00Z`, { day: "numeric", month: "short" })} → {fmtDate(`${end}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" })}
            </p>
            <p className="text-xs text-muted">
              {days} jours{sessions ? ` · ${sessions} séances` : ""}
            </p>
          </div>
          <div className="rounded-2xl border border-line p-3">
            <p className="text-xs text-muted">Montant encaissé</p>
            <p className="mt-1 font-display text-xl font-extrabold text-accent-600">{mad(Number(sub.price_mad))}</p>
            <EntityBadge id={sub.entity_id} />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">{sub.end_date >= today ? "La nouvelle période commence à la fin de l'actuelle." : "L'abonnement est terminé : la nouvelle période commence aujourd'hui."}</p>
        <Field label="Mode de paiement" className="mt-4">
          <Select name="method" defaultValue="especes">
            {(Object.keys(PAY_LABEL) as PayMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAY_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <LinkButton variant="ghost" href={closeHref} scroll={false}>
            Annuler
          </LinkButton>
          <SubmitButton pendingText="Encaissement…">
            <RefreshCw className="size-4" /> Renouveler et encaisser
          </SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
