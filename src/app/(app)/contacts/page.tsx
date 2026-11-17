import { Phone, UserPlus, Users } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getContacts } from "@/lib/data";
import { entity } from "@/lib/entities";
import { CONTACT_STATUS_LABEL, SOURCE_LABEL, addDaysKey, dayKey, fmtDate } from "@/lib/utils";
import type { ContactStatus, LeadSource } from "@/lib/types";
import type { MemberCard } from "@/lib/types-access";
import { referralCode } from "@/lib/loyalty";
import { Avatar, Empty, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery, one } from "@/components/data-table/match";
import { SaveViewButton } from "@/components/data-table/save-view";
import { ContactLink } from "@/components/quick-view/contact-link";
import { StatusBadge, TagChip, WhatsAppButton } from "@/components/contacts/bits";
import { formatPhone } from "@/components/contacts/helpers";

export const metadata = { title: "Clients & contacts" };

const STATUSES: ContactStatus[] = ["client", "prospect", "ancien"];
const PERIODS: Record<string, number> = { "7j": 7, "30j": 30, "90j": 90 };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const supabase = await createClient();
  const q = one(sp.q)?.slice(0, 80);
  const statutRaw = one(sp.statut) as ContactStatus | undefined;
  const statut = statutRaw && STATUSES.includes(statutRaw) ? statutRaw : undefined;
  const tag = one(sp.tag);
  const etabRaw = one(sp.etab);
  const etab = scope.ids.find((e) => e === etabRaw);
  const sourceRaw = one(sp.source);
  const source = sourceRaw && sourceRaw in SOURCE_LABEL ? (sourceRaw as LeadSource) : undefined;
  const periodeRaw = one(sp.periode);
  const periode = periodeRaw && PERIODS[periodeRaw] ? periodeRaw : undefined;
  const today = dayKey();

  const [all, { data: cardRows }] = await Promise.all([getContacts(scope), q ? supabase.from("member_cards").select("*") : Promise.resolve({ data: [] })]);
  const cardOf = new Map(((cardRows ?? []) as MemberCard[]).map((c) => [c.contact_id, c.code]));

  // Compteurs sur tout le périmètre
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ContactStatus, number>;
  const tagFreq = new Map<string, number>();
  const sourceFreq = new Map<LeadSource, number>();
  for (const c of all) {
    counts[c.status]++;
    for (const t of c.tags ?? []) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
    if (c.source) sourceFreq.set(c.source, (sourceFreq.get(c.source) ?? 0) + 1);
  }
  const topTags = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const nNew = all.filter((c) => dayKey(c.created_at) >= addDaysKey(today, -30)).length;
  const since = periode ? addDaysKey(today, -PERIODS[periode]!) : null;

  const contacts = all.filter(
    (c) =>
      (!statut || c.status === statut) &&
      (!tag || c.tags.includes(tag)) &&
      (!etab || c.entity_ids.includes(etab)) &&
      (!source || c.source === source) &&
      (!since || dayKey(c.created_at) >= since) &&
      matchesQuery(q, c.full_name, c.phone, c.email, c.city, c.guardian_name, c.tags, cardOf.get(c.id), referralCode(c), c.entity_ids.map((e) => entity(e)?.short ?? e)),
  );
  const filtered = !!(q || statut || tag || etab || source || periode);

  const columns: DataColumn[] = [
    { key: "nom", label: "Nom", card: "title" },
    { key: "telephone", label: "Téléphone", className: "whitespace-nowrap tabular-nums text-slate-600", card: "subtitle" },
    { key: "email", label: "E-mail", hidden: true, className: "max-w-[220px] truncate text-slate-600" },
    { key: "etablissements", label: "Établissements" },
    { key: "ville", label: "Ville", hidden: true },
    { key: "tags", label: "Tags" },
    { key: "source", label: "Source", hidden: true },
    { key: "statut", label: "Statut", card: "right" },
    { key: "cree", label: "Créé le", hidden: true, className: "whitespace-nowrap tabular-nums text-slate-600" },
    { key: "actions", label: "Actions", srOnly: true, noExport: true, sortable: false, hideable: false, card: "footer", className: "w-px !py-1.5" },
  ];

  const rows: DataRow[] = contacts.map((c) => ({
    id: c.id,
    href: `/contacts/${c.id}`,
    cells: {
      nom: (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={c.full_name} size={32} />
          <span className="min-w-0">
            <ContactLink id={c.id} name={c.full_name} className="block truncate" />
            <span className="block truncate text-xs text-muted">{c.email ?? `Depuis le ${fmtDate(c.created_at)}`}</span>
          </span>
        </span>
      ),
      telephone: formatPhone(c.phone),
      email: c.email,
      etablissements: <EntityDots ids={c.entity_ids} />,
      ville: c.city,
      tags: c.tags.length ? (
        <span className="flex max-w-[220px] flex-wrap gap-1">
          {c.tags.slice(0, 2).map((t) => (
            <TagChip key={t}>{t}</TagChip>
          ))}
          {c.tags.length > 2 && <span className="text-[11px] text-muted">+{c.tags.length - 2}</span>}
        </span>
      ) : null,
      source: c.source ? SOURCE_LABEL[c.source] : null,
      statut: <StatusBadge status={c.status} />,
      cree: fmtDate(c.created_at),
      actions:
        c.phone || c.whatsapp_optin ? (
          <span className="flex items-center justify-end gap-0.5">
            {c.phone && (
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} title="Appeler" aria-label={`Appeler ${c.full_name}`} className={buttonClass("ghost", "w-9 px-0")}>
                <Phone />
              </a>
            )}
            {c.whatsapp_optin && <WhatsAppButton phone={c.phone} />}
          </span>
        ) : (
          ""
        ),
    },
    values: {
      nom: c.full_name,
      telephone: c.phone,
      email: c.email,
      etablissements: c.entity_ids.map((e) => entity(e)?.short ?? e).join(", "),
      ville: c.city,
      tags: c.tags.join(", "),
      source: c.source ? SOURCE_LABEL[c.source] : null,
      statut: CONTACT_STATUS_LABEL[c.status],
      cree: c.created_at,
    },
  }));

  const multi = scope.ids.length > 1;
  const viewName = [statut ? `${CONTACT_STATUS_LABEL[statut]}s` : "Contacts", tag, etab && entity(etab)?.short, q && `« ${q} »`].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients & contacts"
        subtitle={`${all.length} fiches · ${nNew} nouvelles en 30 jours${scope.current ? ` · ${scope.current.short}` : ""}`}
        actions={
          <LinkButton href="/contacts/nouveau" variant="brand">
            <UserPlus /> Nouveau contact
          </LinkButton>
        }
      />

      <ListToolbar
        placeholder="Nom, téléphone, e-mail, ville, tag, code carte…"
        filters={[
          { param: "statut", label: "Tous", options: STATUSES.map((s) => ({ value: s, label: s === "ancien" ? "Anciens" : `${CONTACT_STATUS_LABEL[s]}s`, count: counts[s] })) },
          ...(multi ? [{ param: "etab", label: "Tous établ.", options: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ value: e.id, label: e.short })) }] : []),
          { param: "periode", label: "Toute date", options: [{ value: "7j", label: "Nouveaux 7 j" }, { value: "30j", label: "30 j" }, { value: "90j", label: "90 j" }] },
          ...(topTags.length ? [{ param: "tag", label: "Tous tags", options: topTags.map(([t, n]) => ({ value: t, label: t, count: n })) }] : []),
          ...(sourceFreq.size > 1
            ? [{ param: "source", label: "Toutes sources", options: [...sourceFreq.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ value: s, label: SOURCE_LABEL[s], count: n })) }]
            : []),
        ]}
        right={<SaveViewButton defaultLabel={viewName} icon="/contacts" />}
      />

      <DataTable
        id="contacts"
        columns={columns}
        rows={rows}
        selectable
        query={q}
        filtered={filtered}
        clearHref="/contacts"
        unit={["contact", "contacts"]}
        minWidth={720}
        empty={
          <Empty
            icon={<Users />}
            title="Aucun contact pour l'instant"
            text="Ajoutez vos premiers clients et prospects."
            action={
              <LinkButton href="/contacts/nouveau" variant="brand">
                <UserPlus /> Nouveau contact
              </LinkButton>
            }
          />
        }
      />
    </div>
  );
}
