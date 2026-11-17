import { Coins, Gift, Plus, UserPlus, Users } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getContacts, monthKey } from "@/lib/data";
import { entity } from "@/lib/entities";
import { getSettings } from "@/lib/settings";
import type { Contact } from "@/lib/types";
import type { GiftCard, GiftCardStatus, Referral } from "@/lib/types-loyalty";
import { fmtDate, mad, relative } from "@/lib/utils";
import { loadBalances, pointsValue, referralCode } from "@/lib/loyalty";
import { SolidTile } from "@/components/stat-tile";
import { Avatar, Badge, Card, CardHeader, Empty, Field, LinkButton, PageHeader, Segmented } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ContactPicker } from "@/components/contact-picker";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery, one } from "@/components/data-table/match";
import { SaveViewButton } from "@/components/data-table/save-view";
import { ContactLink } from "@/components/quick-view/contact-link";
import { formatPhone } from "@/components/contacts/helpers";
import { GiftStatusBadge, ValidAt, giftState, pts } from "@/components/loyalty/bits";
import { createReferral } from "@/actions/loyalty";

export const metadata = { title: "Fidélité & cadeaux" };

type Tab = "membres" | "cartes" | "parrainage";
type Settings = Awaited<ReturnType<typeof getSettings>>;
type Balance = { balance: number; earned: number; last: string };

const GIFT_STATES: Record<string, GiftCardStatus> = { actives: "active", utilisees: "epuisee", expirees: "expiree", annulees: "annulee" };

export default async function LoyaltyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tabRaw = one(sp.tab);
  const tab: Tab = tabRaw === "cartes" || tabRaw === "parrainage" ? tabRaw : "membres";
  const q = one(sp.q)?.slice(0, 80) ?? "";

  const scope = await getScope();
  const supabase = await createClient();
  const [settings, contacts, balances, { data: cardRows }, { data: refRows }] = await Promise.all([
    getSettings(),
    getContacts(scope),
    loadBalances(supabase),
    supabase.from("gift_cards").select("*").order("created_at", { ascending: false }),
    supabase.from("referrals").select("*").order("created_at", { ascending: false }),
  ]);
  const cById = new Map(contacts.map((c) => [c.id, c]));

  const cards = ((cardRows ?? []) as GiftCard[]).filter((c) => !c.entity_ids.length || c.entity_ids.some((e) => scope.ids.includes(e)) || scope.ids.includes(c.entity_id));
  const referrals = ((refRows ?? []) as Referral[]).filter((r) => cById.has(r.referrer_id) || cById.has(r.referee_id));

  /* Indicateurs */
  const members = contacts.map((c) => ({ c, b: balances.get(c.id) })).filter((m): m is { c: Contact; b: Balance } => !!m.b && m.b.earned > 0);
  const circulating = members.reduce((a, m) => a + Math.max(0, m.b.balance), 0);
  const activeCards = cards.filter((c) => giftState(c) === "active");
  const activeBalance = activeCards.reduce((a, c) => a + Number(c.balance_mad), 0);
  const thisMonth = monthKey(new Date());
  const refMonth = referrals.filter((r) => monthKey(r.created_at) === thisMonth);
  const refValidMonth = referrals.filter((r) => r.rewarded_at && monthKey(r.rewarded_at) === thisMonth).length;

  const ratio = `${settings.loyalty_points_per_10mad} point${settings.loyalty_points_per_10mad > 1 ? "s" : ""} par 10 MAD · 1 point = ${String(settings.loyalty_point_value_mad).replace(".", ",")} MAD`;
  const multi = scope.ids.length > 1;
  const etabFilter = multi ? [{ param: "etab", label: "Tous établ.", options: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ value: e.id, label: e.short })) }] : [];
  const etab = scope.ids.find((e) => e === one(sp.etab));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fidélité & cadeaux"
        subtitle={`Un seul programme pour les 7 établissements · ${ratio}`}
        actions={
          <LinkButton href="/fidelite/cartes/nouvelle" variant="brand">
            <Plus /> Nouvelle carte cadeau
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        <SolidTile label="Points en circulation" value={new Intl.NumberFormat("fr-FR").format(circulating)} sub={`soit ${mad(pointsValue(circulating, settings))} · ${members.length} membres`} icon={<Coins />} />
        <SolidTile label="Cartes cadeaux actives" value={activeCards.length} sub={`${mad(activeBalance)} de solde à utiliser`} icon={<Gift />} href="/fidelite?tab=cartes" />
        <SolidTile label="Parrainages du mois" value={refMonth.length} sub={`${refValidMonth} validé${refValidMonth > 1 ? "s" : ""} · bonus ${settings.referral_bonus_points} pts`} icon={<UserPlus />} href="/fidelite?tab=parrainage" />
      </div>

      <Segmented
        active={tab}
        items={[
          { id: "membres", href: "/fidelite", label: "Membres", count: members.length },
          { id: "cartes", href: "/fidelite?tab=cartes", label: "Cartes cadeaux", count: activeCards.length },
          { id: "parrainage", href: "/fidelite?tab=parrainage", label: "Parrainage", count: referrals.length },
        ]}
      />

      {tab === "membres" && <Members members={members} q={q} solde={one(sp.solde)} etab={etab} settings={settings} etabFilter={etabFilter} />}
      {tab === "cartes" && <Cards cards={cards} q={q} etat={one(sp.etat)} etab={etab} etabFilter={etabFilter} />}
      {tab === "parrainage" && <Referrals referrals={referrals} contacts={contacts} q={q} statut={one(sp.statut)} bonus={settings.referral_bonus_points} />}
    </div>
  );
}

type EtabFilter = { param: string; label: string; options: { value: string; label: string }[] }[];

/* ---------- Membres ---------- */
function Members({ members, q, solde, etab, settings, etabFilter }: { members: { c: Contact; b: Balance }[]; q: string; solde?: string; etab?: string; settings: Settings; etabFilter: EtabFilter }) {
  const ranked = [...members].sort((a, b) => b.b.balance - a.b.balance).map((m, i) => ({ ...m, rank: i + 1 }));
  const list = ranked.filter(
    ({ c, b }) =>
      (!etab || c.entity_ids.includes(etab as never)) &&
      (solde !== "positif" || b.balance > 0) &&
      (solde !== "eleve" || b.balance >= 1000) &&
      (solde !== "nul" || b.balance <= 0) &&
      matchesQuery(q, c.full_name, c.phone, c.email, referralCode(c), c.tags),
  );
  const columns: DataColumn[] = [
    { key: "rang", label: "#", numeric: true, card: "hide", className: "w-12 !text-left text-muted", headClassName: "w-12 !text-left" },
    { key: "client", label: "Client", card: "title", hideable: false },
    { key: "telephone", label: "Téléphone", hidden: true, className: "whitespace-nowrap tabular-nums text-slate-600" },
    { key: "code", label: "Code parrainage", hidden: true, className: "font-mono text-xs" },
    { key: "solde", label: "Solde", numeric: true, card: "right", className: "font-semibold text-ink" },
    { key: "valeur", label: "Valeur", numeric: true, className: "text-slate-600" },
    { key: "cumul", label: "Cumul gagné", numeric: true, className: "text-slate-600" },
    { key: "dernier", label: "Dernier mouvement", className: "whitespace-nowrap text-[13px] text-muted" },
  ];
  const rows: DataRow[] = list.map(({ c, b, rank }) => ({
    id: c.id,
    href: `/contacts/${c.id}?tab=fidelite`,
    cells: {
      rang: rank,
      client: (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={c.full_name} size={30} />
          <span className="min-w-0">
            <ContactLink id={c.id} name={c.full_name} className="block truncate" />
            <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <EntityDots ids={c.entity_ids} />
              <span className="font-mono">{referralCode(c)}</span>
            </span>
          </span>
        </span>
      ),
      telephone: formatPhone(c.phone),
      code: referralCode(c),
      solde: pts(b.balance),
      valeur: mad(pointsValue(Math.max(0, b.balance), settings)),
      cumul: pts(b.earned),
      dernier: b.last ? relative(b.last) : null,
    },
    values: {
      rang: rank,
      client: c.full_name,
      telephone: c.phone,
      code: referralCode(c),
      solde: b.balance,
      valeur: pointsValue(Math.max(0, b.balance), settings),
      cumul: b.earned,
      dernier: b.last || null,
    },
  }));
  return (
    <section>
      <ListToolbar
        placeholder="Nom, téléphone, e-mail, code de parrainage…"
        filters={[
          {
            param: "solde",
            label: "Tous soldes",
            options: [
              { value: "positif", label: "Avec des points" },
              { value: "eleve", label: "1 000 pts et +" },
              { value: "nul", label: "Solde épuisé" },
            ],
          },
          ...etabFilter,
        ]}
        right={<SaveViewButton defaultLabel={["Membres fidélité", solde === "eleve" && "1 000 pts et +", q && `« ${q} »`].filter(Boolean).join(" · ")} icon="/fidelite" />}
      />
      <DataTable
        id="fidelite-membres"
        columns={columns}
        rows={rows}
        query={q}
        filtered={!!(q || solde || etab)}
        clearHref="/fidelite"
        unit={["membre", "membres"]}
        selectable
        minWidth={720}
        empty={<Empty icon={<Users />} title="Aucun point pour l'instant" text="Les points sont crédités automatiquement à chaque vente liée à un client." action={<LinkButton href="/caisse">Encaisser une vente</LinkButton>} />}
      />
    </section>
  );
}

/* ---------- Cartes cadeaux ---------- */
function Cards({ cards, q, etat, etab, etabFilter }: { cards: GiftCard[]; q: string; etat?: string; etab?: string; etabFilter: EtabFilter }) {
  // Par défaut : cartes actives (une recherche porte sur toutes les cartes)
  const wanted = etat === "toutes" ? null : etat && GIFT_STATES[etat] ? GIFT_STATES[etat] : q ? null : "active";
  const list = cards.filter(
    (c) =>
      (!wanted || giftState(c) === wanted) &&
      (!etab || c.entity_id === etab || c.entity_ids.includes(etab as never) || !c.entity_ids.length) &&
      matchesQuery(q, c.code, c.code.replace(/-/g, ""), c.beneficiary_name, c.buyer_name, Number(c.amount_mad), Number(c.balance_mad), mad(Number(c.amount_mad)), c.message),
  );
  const columns: DataColumn[] = [
    { key: "code", label: "Code", card: "title", hideable: false, className: "whitespace-nowrap" },
    { key: "statut", label: "Statut", card: "subtitle" },
    { key: "beneficiaire", label: "Bénéficiaire", className: "max-w-[200px] truncate" },
    { key: "acheteur", label: "Acheteur", hidden: true, className: "max-w-[200px] truncate" },
    { key: "valable", label: "Valable à" },
    { key: "expire", label: "Expire le", className: "whitespace-nowrap tabular-nums text-[13px] text-slate-600" },
    { key: "solde", label: "Solde", numeric: true, card: "right", className: "font-semibold text-ink" },
    { key: "montant", label: "Montant initial", numeric: true, className: "text-slate-600" },
    { key: "cree", label: "Créée le", hidden: true, className: "whitespace-nowrap tabular-nums text-[13px] text-slate-600" },
  ];
  const person = (id: string | null, name: string | null) => (id ? <ContactLink id={id} name={name ?? "Client"} /> : name ? <span>{name}</span> : null);
  const rows: DataRow[] = list.map((c) => ({
    id: c.id,
    href: `/fidelite/cartes/${c.id}`,
    cells: {
      code: <span className="font-mono text-[13px] font-semibold text-ink">{c.code}</span>,
      statut: <GiftStatusBadge card={c} />,
      beneficiaire: person(c.beneficiary_contact_id, c.beneficiary_name),
      acheteur: person(c.buyer_contact_id, c.buyer_name),
      valable: <ValidAt ids={c.entity_ids} />,
      expire: fmtDate(c.expires_on),
      solde: mad(c.balance_mad),
      montant: mad(c.amount_mad),
      cree: fmtDate(c.created_at),
    },
    values: {
      code: c.code,
      statut: { active: "Active", epuisee: "Utilisée", expiree: "Expirée", annulee: "Annulée" }[giftState(c)],
      beneficiaire: c.beneficiary_name,
      acheteur: c.buyer_name,
      valable: c.entity_ids.length ? c.entity_ids.map((e) => entity(e)?.short ?? e).join(", ") : "Tout le groupe",
      expire: c.expires_on,
      solde: Number(c.balance_mad),
      montant: Number(c.amount_mad),
      cree: c.created_at,
    },
  }));
  return (
    <section>
      <ListToolbar
        placeholder="Code (MU-GC-…), nom, montant…"
        filters={[
          {
            param: "etat",
            label: "Actives",
            options: [
              { value: "utilisees", label: "Utilisées" },
              { value: "expirees", label: "Expirées" },
              { value: "annulees", label: "Annulées" },
              { value: "toutes", label: "Toutes" },
            ],
          },
          ...etabFilter,
        ]}
        right={<SaveViewButton defaultLabel={["Cartes cadeaux", etat && etat !== "toutes" ? etat : "actives", q && `« ${q} »`].filter(Boolean).join(" · ")} icon="/fidelite" />}
      />
      <DataTable
        id="fidelite-cartes"
        columns={columns}
        rows={rows}
        query={q}
        filtered={!!(q || etat || etab)}
        clearHref="/fidelite?tab=cartes"
        unit={["carte", "cartes"]}
        minWidth={760}
        empty={
          <Empty
            icon={<Gift />}
            title="Aucune carte cadeau active"
            text="Offrez une prestation dans un ou plusieurs établissements du groupe, avec un code unique à présenter à l'accueil."
            action={
              <LinkButton href="/fidelite/cartes/nouvelle" variant="brand">
                <Plus /> Créer une carte cadeau
              </LinkButton>
            }
          />
        }
      />
    </section>
  );
}

/* ---------- Parrainage ---------- */
function Referrals({ referrals, contacts, q, statut, bonus }: { referrals: Referral[]; contacts: Contact[]; q: string; statut?: string; bonus: number }) {
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const picker = contacts.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone }));
  const top = new Map<string, { n: number; valid: number }>();
  for (const r of referrals) {
    const t = top.get(r.referrer_id) ?? { n: 0, valid: 0 };
    t.n++;
    if (r.status === "valide") t.valid++;
    top.set(r.referrer_id, t);
  }
  const best = [...top.entries()].sort((a, b) => b[1].valid - a[1].valid || b[1].n - a[1].n).slice(0, 5);

  const list = referrals.filter((r) => {
    if (statut === "valide" && r.status !== "valide") return false;
    if (statut === "attente" && r.status !== "en_attente") return false;
    const a = cById.get(r.referrer_id);
    const b = cById.get(r.referee_id);
    return matchesQuery(q, a?.full_name, a?.phone, a && referralCode(a), b?.full_name, b?.phone);
  });
  const columns: DataColumn[] = [
    { key: "parrain", label: "Parrain", card: "title", hideable: false },
    { key: "code", label: "Code", hidden: true, className: "font-mono text-xs" },
    { key: "filleul", label: "Filleul", card: "subtitle" },
    { key: "statut", label: "Statut", card: "right" },
    { key: "date", label: "Date", className: "whitespace-nowrap text-[13px] text-muted" },
  ];
  const rows: DataRow[] = list.map((r) => {
    const a = cById.get(r.referrer_id);
    const b = cById.get(r.referee_id);
    return {
      id: r.id,
      cells: {
        parrain: a ? (
          <span className="block min-w-0">
            <ContactLink id={a.id} name={a.full_name} />
            <span className="block font-mono text-xs text-muted">{referralCode(a)}</span>
          </span>
        ) : (
          <span className="text-muted">Autre établissement</span>
        ),
        code: a ? referralCode(a) : null,
        filleul: b ? <ContactLink id={b.id} name={b.full_name} className="font-normal text-slate-700" /> : <span className="text-muted">Autre établissement</span>,
        statut: r.status === "valide" ? <Badge tone="green">+{r.bonus_points} pts</Badge> : <Badge tone="amber">En attente du 1er achat</Badge>,
        date: fmtDate(r.rewarded_at ?? r.created_at),
      },
      values: {
        parrain: a?.full_name ?? "Autre établissement",
        code: a ? referralCode(a) : null,
        filleul: b?.full_name ?? "Autre établissement",
        statut: r.status === "valide" ? `Validé (+${r.bonus_points} pts)` : "En attente",
        date: r.rewarded_at ?? r.created_at,
      },
    };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Nouveau parrainage" subtitle={`Le parrain reçoit ${bonus} points au premier achat de son filleul.`} />
          <ActionForm action={createReferral} className="grid gap-4 px-5 pb-5 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Parrain (client existant)">
              <ContactPicker contacts={picker} name="referrer_id" required placeholder="Nom, téléphone…" />
            </Field>
            <Field label="Filleul (nouveau client)">
              <ContactPicker contacts={picker} name="referee_id" required placeholder="Nom, téléphone…" />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton variant="brand">
                <UserPlus className="size-4" /> Enregistrer
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <section>
          <ListToolbar
            placeholder="Parrain, filleul, téléphone, code…"
            filters={[
              {
                param: "statut",
                label: "Tous",
                options: [
                  { value: "attente", label: "En attente", count: referrals.filter((r) => r.status === "en_attente").length },
                  { value: "valide", label: "Validés", count: referrals.filter((r) => r.status === "valide").length },
                ],
              },
            ]}
            right={<SaveViewButton defaultLabel={["Parrainages", statut === "attente" && "en attente", statut === "valide" && "validés", q && `« ${q} »`].filter(Boolean).join(" · ")} icon="/fidelite" />}
          />
          <DataTable
            id="fidelite-parrainages"
            columns={columns}
            rows={rows}
            query={q}
            filtered={!!(q || statut)}
            clearHref="/fidelite?tab=parrainage"
            unit={["parrainage", "parrainages"]}
            empty={<Empty icon={<UserPlus />} title="Aucun parrainage" text="Chaque client a un code de parrainage visible sur sa fiche, onglet Fidélité." />}
          />
        </section>
      </div>

      <Card className="self-start">
        <CardHeader title="Meilleurs parrains" />
        {best.length ? (
          <ul className="divide-y divide-line px-5 pb-3">
            {best.map(([id, t]) => {
              const c = cById.get(id);
              return (
                <li key={id} className="flex items-center gap-2.5 py-2.5">
                  <Avatar name={c?.full_name ?? "?"} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{c ? <ContactLink id={c.id} name={c.full_name} /> : "Client"}</span>
                  <span className="text-xs tabular-nums text-muted">
                    {t.valid}/{t.n}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-[13px] text-muted">Pas encore de parrain.</p>
        )}
      </Card>
    </div>
  );
}
