import { AlarmClock, CalendarX2, CreditCard, Plus, RefreshCw, Repeat, TrendingUp } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import { entity } from "@/lib/entities";
import { PAY_LABEL, SUB_STATUS_LABEL, addDaysKey, cn, dayKey, daysUntil, fmtDate, mad, madShort } from "@/lib/utils";
import type { CatalogItem, Contact, PayMethod, Subscription, SubscriptionStatus } from "@/lib/types";
import { renewSubscription } from "@/actions/subscriptions";
import { SolidTile } from "@/components/stat-tile";
import { Avatar, Badge, DescList, Empty, Field, LinkButton, PageHeader, Select } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Sheet } from "@/components/agenda/sheet";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery, one } from "@/components/data-table/match";
import { SaveViewButton } from "@/components/data-table/save-view";
import { ContactLink } from "@/components/quick-view/contact-link";
import { formatPhone } from "@/components/contacts/helpers";
import { SubscriptionActions } from "@/components/subscriptions/subscription-actions";

export const metadata = { title: "Abonnements" };

const STATUSES: SubscriptionStatus[] = ["actif", "suspendu", "expire", "resilie"];
const STATUS_TONE: Record<SubscriptionStatus, "green" | "amber" | "red" | "gray"> = { actif: "green", suspendu: "amber", expire: "red", resilie: "gray" };
const FILTRES = ["expire-bientot", "auto", "pack", "abonnement"] as const;

const span = (a: string, b: string) => Math.max(1, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000));

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const month = today.slice(0, 7);
  const statutRaw = one(sp.statut) as SubscriptionStatus | undefined;
  const statut = statutRaw && STATUSES.includes(statutRaw) ? statutRaw : null;
  const filtreRaw = one(sp.filtre) as (typeof FILTRES)[number] | undefined;
  const filtre = filtreRaw && FILTRES.includes(filtreRaw) ? filtreRaw : null;
  const etab = scope.ids.find((e) => e === one(sp.etab));
  const q = one(sp.q)?.slice(0, 80) ?? "";

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
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<SubscriptionStatus, number>;
  for (const s of all) counts[s.status]++;

  /* Filtres + recherche (côté serveur) */
  const rank: Record<SubscriptionStatus, number> = { actif: 0, suspendu: 1, expire: 2, resilie: 3 };
  const filteredRows = all
    .filter((s) => {
      if (statut && s.status !== statut) return false;
      if (etab && s.entity_id !== etab) return false;
      if (filtre === "expire-bientot" && !isSoon(s)) return false;
      if (filtre === "auto" && !s.auto_renew) return false;
      if (filtre === "pack" && s.sessions_left === null) return false;
      if (filtre === "abonnement" && s.sessions_left !== null) return false;
      const c = contacts.get(s.contact_id);
      return matchesQuery(q, c?.full_name, c?.phone, c?.email, s.name, entity(s.entity_id)?.short, SUB_STATUS_LABEL[s.status], Number(s.price_mad), mad(Number(s.price_mad)));
    })
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "actif" || a.status === "suspendu" ? a.end_date.localeCompare(b.end_date) : b.end_date.localeCompare(a.end_date)));
  const filtered = !!(q || statut || filtre || etab);

  /** URL de la page en gardant recherche, filtres et tri */
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const s = one(v);
      if (s && k !== "renouveler") p.set(k, s);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return `/abonnements${s ? `?${s}` : ""}`;
  };
  const listHref = href({});
  const multi = scope.ids.length > 1;

  /* Tableau */
  const columns: DataColumn[] = [
    { key: "client", label: "Client", card: "title" },
    { key: "telephone", label: "Téléphone", hidden: true, className: "whitespace-nowrap tabular-nums text-slate-600" },
    { key: "formule", label: "Formule", card: "subtitle", className: "max-w-[240px]" },
    { key: "etab", label: "Établissement", hidden: true },
    { key: "statut", label: "Statut" },
    { key: "periode", label: "Période", className: "w-[200px]" },
    { key: "reste", label: "Reste" },
    { key: "prix", label: "Prix", numeric: true, card: "right", className: "font-semibold text-ink" },
    { key: "actions", label: "Actions", srOnly: true, noExport: true, sortable: false, hideable: false, card: "footer", className: "!py-1.5" },
  ];
  const rows: DataRow[] = filteredRows.map((s) => {
    const c = contacts.get(s.contact_id);
    const name = c?.full_name ?? "Client";
    const d = daysUntil(s.end_date);
    return {
      id: s.id,
      href: `/contacts/${s.contact_id}?tab=abonnements`,
      cells: {
        client: (
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar name={name} size={32} />
            <ContactLink id={s.contact_id} name={name} className="truncate" />
          </span>
        ),
        telephone: formatPhone(c?.phone),
        formule: (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-ink">{s.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2">
              <EntityBadge id={s.entity_id} />
              {s.auto_renew && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted" title="Renouvellement automatique">
                  <Repeat className="size-3" /> Auto
                </span>
              )}
            </span>
          </span>
        ),
        etab: <EntityBadge id={s.entity_id} />,
        statut: (
          <Badge tone={STATUS_TONE[s.status]} dot>
            {SUB_STATUS_LABEL[s.status]}
          </Badge>
        ),
        periode: <Period sub={s} today={today} />,
        reste: <Remaining sub={s} />,
        prix: mad(Number(s.price_mad)),
        actions: <SubscriptionActions sub={s} renewHref={href({ renouveler: s.id })} />,
      },
      values: {
        client: name,
        telephone: c?.phone,
        formule: s.name,
        etab: entity(s.entity_id)?.short,
        statut: SUB_STATUS_LABEL[s.status],
        periode: `${s.start_date} → ${s.end_date}`,
        reste: s.status === "resilie" ? null : d,
        prix: Number(s.price_mad),
      },
    };
  });

  /* Renouvellement demandé */
  const renewId = one(sp.renouveler);
  const renewing = renewId ? (all.find((s) => s.id === renewId && s.status !== "resilie") ?? null) : null;
  let renewItem: CatalogItem | null = null;
  if (renewing?.item_id) {
    const { data } = await supabase.from("catalog_items").select("*").eq("id", renewing.item_id).maybeSingle();
    renewItem = data as CatalogItem | null;
  }

  const viewName = ["Abonnements", statut && `${SUB_STATUS_LABEL[statut]}s`, filtre === "expire-bientot" && "à renouveler", filtre === "pack" && "packs", etab && entity(etab)?.short, q && `« ${q} »`].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Abonnements"
        subtitle={scope.current ? <EntityBadge id={scope.current.id} short={false} /> : `Abonnements et packs · ${scope.allowed.length} établissements`}
        actions={
          <LinkButton href="/abonnements/nouveau" variant="brand">
            <Plus /> Nouvel abonnement
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile href="/abonnements?statut=actif" label="Actifs" value={actives.length} sub={`${autoCount} en renouvellement auto`} icon={<CreditCard />} />
        <SolidTile
          href="/abonnements?filtre=expire-bientot"
          label="À renouveler sous 7 j"
          value={soonList.length}
          sub={soonList.length ? `${mad(soonList.reduce((s, x) => s + Number(x.price_mad), 0))} à sécuriser` : "Rien d'urgent"}
          icon={<AlarmClock />}
        />
        <SolidTile href="/abonnements?statut=expire" label="Expirés ce mois" value={expiredMonth.length} sub="Clients à relancer" icon={<CalendarX2 />} />
        <SolidTile label="Revenu mensuel récurrent" value={madShort(Math.round(mrr))} sub="Estimation" icon={<TrendingUp />} />
      </div>

      <ListToolbar
        placeholder="Client, téléphone, formule, prix…"
        filters={[
          { param: "statut", label: "Tous", options: STATUSES.map((s) => ({ value: s, label: `${SUB_STATUS_LABEL[s]}s`, count: counts[s] })) },
          {
            param: "filtre",
            label: "Tout type",
            options: [
              { value: "expire-bientot", label: "À renouveler", count: soonList.length },
              { value: "abonnement", label: "Abonnements" },
              { value: "pack", label: "Packs" },
              { value: "auto", label: "Renouv. auto" },
            ],
          },
          ...(multi ? [{ param: "etab", label: "Tous établ.", options: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ value: e.id, label: e.short })) }] : []),
        ]}
        right={<SaveViewButton defaultLabel={viewName} icon="/abonnements" />}
      />

      <DataTable
        id="abonnements"
        columns={columns}
        rows={rows}
        query={q}
        filtered={filtered}
        clearHref="/abonnements"
        selectable
        unit={["abonnement", "abonnements"]}
        minWidth={980}
        empty={
          <Empty
            icon={<CreditCard />}
            title="Aucun abonnement"
            text="Créez un abonnement ou un pack ici ou depuis la fiche d'un client."
            action={
              <LinkButton href="/abonnements/nouveau" variant="brand">
                <Plus /> Nouvel abonnement
              </LinkButton>
            }
          />
        }
      />

      {renewing && <RenewSheet sub={renewing} item={renewItem} contact={contacts.get(renewing.contact_id)} today={today} closeHref={listHref} back={listHref} />}
    </div>
  );
}

function Period({ sub, today }: { sub: Subscription; today: string }) {
  const total = span(sub.start_date, sub.end_date);
  const elapsed = today <= sub.start_date ? 0 : (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${sub.start_date}T00:00:00Z`)) / 86_400_000;
  const ratio = sub.status === "resilie" ? 1 : Math.min(1, elapsed / total);
  const d = daysUntil(sub.end_date);
  const bar = sub.status !== "actif" ? "bg-slate-300" : d < 0 ? "bg-red-500" : d <= 7 ? "bg-accent-500" : "bg-brand-500";
  return (
    <div className="min-w-0">
      <div className="flex justify-between gap-2 text-[11px] tabular-nums text-muted">
        <span>{fmtDate(`${sub.start_date}T12:00:00Z`, { day: "numeric", month: "short" })}</span>
        <span>{fmtDate(`${sub.end_date}T12:00:00Z`, { day: "numeric", month: "short", year: "2-digit" })}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(3, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

function Remaining({ sub }: { sub: Subscription }) {
  const d = daysUntil(sub.end_date);
  const isPack = sub.sessions_left !== null;
  let label: string;
  let tone: "gray" | "red" | "accent" | "amber" | "green";
  if (sub.status === "resilie") {
    label = "Résilié";
    tone = "gray";
  } else if (d < 0) {
    label = `Fini il y a ${-d} j`;
    tone = "red";
  } else if (d === 0) {
    label = "Fin aujourd'hui";
    tone = "red";
  } else if (d <= 7) {
    label = `${d} j`;
    tone = d <= 2 ? "red" : "accent";
  } else {
    label = `${d} j`;
    tone = sub.status === "suspendu" ? "amber" : "gray";
  }
  return (
    <div className="flex shrink-0 flex-col items-start gap-1">
      <Badge tone={tone}>{label}</Badge>
      {isPack && (
        <span className={cn("whitespace-nowrap text-[11px] tabular-nums", (sub.sessions_left ?? 0) <= 1 ? "font-medium text-accent-700" : "text-muted")}>
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
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
          <RefreshCw className="size-4" />
        </span>
      }
      title="Renouveler l'abonnement"
      subtitle={`${contact?.full_name ?? "Client"} · ${sub.name}`}
    >
      <ActionForm action={renewSubscription.bind(null, sub.id)}>
        <input type="hidden" name="back" value={back} />
        <DescList
          items={[
            [
              "Nouvelle période",
              <span key="p" className="tabular-nums">
                {fmtDate(`${start}T12:00:00Z`, { day: "numeric", month: "short" })} → {fmtDate(`${end}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" })}
              </span>,
            ],
            ["Durée", `${days} jours${sessions ? ` · ${sessions} séances` : ""}`],
            ["Établissement", <EntityBadge key="e" id={sub.entity_id} />],
            [
              "Montant",
              <span key="m" className="text-base font-semibold tabular-nums">
                {mad(Number(sub.price_mad))}
              </span>,
            ],
          ]}
        />
        <p className="mt-2 text-xs text-muted">{sub.end_date >= today ? "La nouvelle période commence à la fin de l'actuelle." : "L'abonnement est terminé : la nouvelle période commence aujourd'hui."}</p>
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
            <RefreshCw /> Renouveler et encaisser
          </SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
