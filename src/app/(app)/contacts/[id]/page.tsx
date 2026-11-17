import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  FileHeart,
  Gift,
  QrCode,
  CreditCard,
  Filter,
  History,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Receipt,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import {
  age,
  APPT_STATUS_LABEL,
  cn,
  daysUntil,
  fmtDate,
  fmtTime,
  mad,
  PAY_LABEL,
  relative,
  SALE_STATUS_LABEL,
  SOURCE_LABEL,
  SUB_STATUS_LABEL,
} from "@/lib/utils";
import type { Activity, Appointment, Contact, Lead, Profile, Sale, SaleItem, Subscription } from "@/lib/types";
import { deleteContact } from "@/actions/contacts";
import { Avatar, Badge, buttonClass, Card, CardHeader, Empty, LinkButton, Segmented } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ConfirmButton } from "@/components/confirm-button";
import { BackLink } from "@/components/back-link";
import { StatusBadge, WhatsAppButton } from "@/components/contacts/bits";
import { ActivityForm, Timeline } from "@/components/contacts/timeline";
import { LeadCard } from "@/components/leads/lead-card";
import { param } from "@/components/contacts/helpers";
import { ContactDossier } from "@/components/ext/contact-dossier";
import { ContactLoyalty } from "@/components/ext/contact-loyalty";
import { ContactAccess } from "@/components/ext/contact-access";

export const metadata = { title: "Fiche client" };

const TABS = [
  { id: "historique", label: "Historique", icon: History },
  { id: "abonnements", label: "Abonnements", icon: CreditCard },
  { id: "rdv", label: "Rendez-vous", icon: CalendarDays },
  { id: "achats", label: "Achats", icon: Receipt },
  { id: "prospects", label: "Prospects", icon: Filter },
  { id: "dossier", label: "Dossier", icon: FileHeart },
  { id: "fidelite", label: "Fidélité", icon: Gift },
  { id: "carte", label: "Carte d'accès", icon: QrCode },
] as const;
type TabId = (typeof TABS)[number]["id"];

const SUB_TONE = { actif: "green", suspendu: "amber", expire: "gray", resilie: "gray" } as const;
const SALE_TONE = { payee: "green", partielle: "amber", impayee: "red", remboursee: "gray" } as const;
const APPT_TONE = { prevu: "amber", confirme: "brand", arrive: "green", termine: "gray", absent: "red", annule: "gray" } as const;

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const allowedIds = scope.allowed.map((e) => e.id);

  const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  const contact = data as Contact | null;
  if (!contact || !contact.entity_ids.some((e) => allowedIds.includes(e))) notFound();

  const tabRaw = param(sp.tab) as TabId | undefined;
  const tab: TabId = TABS.some((t) => t.id === tabRaw) ? tabRaw! : "historique";

  const [{ data: salesRaw }, { data: subsRaw }, { data: apptRaw }, { data: leadsRaw }, { data: actRaw }, { data: peopleRaw }] = await Promise.all([
    supabase.from("sales").select("*").eq("contact_id", id).in("entity_id", scope.ids).order("sold_at", { ascending: false }),
    supabase.from("subscriptions").select("*").eq("contact_id", id).in("entity_id", scope.ids).order("end_date", { ascending: false }),
    supabase.from("appointments").select("*").eq("contact_id", id).in("entity_id", scope.ids).order("starts_at", { ascending: false }),
    supabase.from("leads").select("*").eq("contact_id", id).in("entity_id", scope.ids).order("updated_at", { ascending: false }),
    supabase.from("activities").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("*"),
  ]);
  const sales = (salesRaw ?? []) as Sale[];
  const subs = (subsRaw ?? []) as Subscription[];
  const appts = (apptRaw ?? []) as Appointment[];
  const leads = (leadsRaw ?? []) as Lead[];
  const activities = ((actRaw ?? []) as Activity[]).filter((a) => !a.entity_id || scope.ids.includes(a.entity_id));
  const people = byId(peopleRaw as Profile[]);

  const { data: itemsRaw } = sales.length ? await supabase.from("sale_items").select("*").in("sale_id", sales.map((s) => s.id)) : { data: [] };
  const itemsBySale = new Map<string, SaleItem[]>();
  for (const it of (itemsRaw ?? []) as SaleItem[]) itemsBySale.set(it.sale_id, [...(itemsBySale.get(it.sale_id) ?? []), it]);

  /* Indicateurs */
  const spent = sales.filter((s) => s.status !== "remboursee").reduce((a, s) => a + Number(s.total_mad), 0);
  const due = sales.filter((s) => s.status === "impayee" || s.status === "partielle").reduce((a, s) => a + Number(s.total_mad) - Number(s.paid_mad), 0);
  const nowIso = new Date().toISOString();
  const honoured = appts.filter((a) => a.status === "arrive" || a.status === "termine").length;
  const visits = activities.filter((a) => a.kind === "visite").length;
  const upcoming = appts.filter((a) => a.starts_at >= nowIso && a.status !== "annule").sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
  const activeSubs = subs.filter((s) => s.status === "actif");

  const mine = contact.entity_ids.filter((e) => allowedIds.includes(e));
  const canDelete = me.role === "direction" || me.role === "manager";
  const years = age(contact.birth_date);
  const hiddenScope = scope.current && !contact.entity_ids.includes(scope.current.id);
  const formEntities = scope.allowed.filter((e) => mine.includes(e.id));

  const counts: Partial<Record<TabId, number>> = { historique: activities.length, abonnements: subs.length, rdv: appts.length, achats: sales.length, prospects: leads.length };

  return (
    <div className="space-y-6">
      <BackLink href="/contacts" label="Clients & contacts" />

      {/* En-tête */}
      <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar name={contact.full_name} size={56} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight sm:text-2xl">{contact.full_name}</h1>
                <StatusBadge status={contact.status} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                {contact.sex && <span>{contact.sex === "F" ? "Femme" : "Homme"}</span>}
                {years !== null && <span>{years} ans</span>}
                {contact.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" /> {contact.city}
                  </span>
                )}
                {contact.source && <span>Via {SOURCE_LABEL[contact.source]}</span>}
                {contact.guardian_name && (
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="size-3.5" /> Parent : {contact.guardian_name}
                  </span>
                )}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {contact.entity_ids.map((e) => (
                  <EntityBadge key={e} id={e} />
                ))}
                {contact.tags.map((t) => (
                  <Badge key={t} tone="gray">
                    {t}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {contact.phone && (
                  <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className={buttonClass("secondary", "h-8")}>
                    <Phone /> {contact.phone}
                  </a>
                )}
                {contact.whatsapp_optin && <WhatsAppButton phone={contact.phone} label="WhatsApp" text={`Bonjour ${contact.full_name.split(" ")[0]},`} className="h-8 px-3 text-[13px]" />}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className={buttonClass("secondary", "h-8 max-w-full")}>
                    <Mail /> <span className="truncate">{contact.email}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-[360px] lg:justify-end">
            <Link href={`/caisse?contact=${id}`} className={buttonClass("primary")}>
              <ShoppingCart /> Encaisser
            </Link>
            <Link href={`/agenda/nouveau?contact=${id}`} className={buttonClass("secondary")}>
              <CalendarPlus /> Rendez-vous
            </Link>
            <Link href={`/abonnements/nouveau?contact=${id}`} className={buttonClass("secondary")}>
              <CreditCard /> Abonnement
            </Link>
            <Link href={`/contacts/${id}/modifier`} className={buttonClass("ghost")}>
              <Pencil /> Modifier
            </Link>
            {canDelete && (
              <form action={deleteContact.bind(null, id)}>
                <ConfirmButton
                  message={
                    contact.entity_ids.some((e) => !allowedIds.includes(e))
                      ? `${contact.full_name} fréquente aussi d'autres établissements : la fiche sera seulement retirée des vôtres. Continuer ?`
                      : `Supprimer définitivement ${contact.full_name} et tout son historique ? Cette action est irréversible.`
                  }
                  className="h-9 px-3"
                >
                  <Trash2 className="size-4" /> <span className="sr-only">Supprimer</span>
                </ConfirmButton>
              </form>
            )}
          </div>
        </div>
      </section>

      {hiddenScope && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Ce contact ne fréquente pas {scope.current!.short} : seules les données de cet établissement sont affichées. Choisissez « Tous » dans le sélecteur pour voir tout son historique.
        </p>
      )}

      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Indicator label="Total dépensé" value={mad(spent)} sub={due > 0 ? `Reste dû : ${mad(due)}` : `${sales.length} achat${sales.length > 1 ? "s" : ""}`} alert={due > 0} href={`/contacts/${id}?tab=achats`} />
        <Indicator label="Visites & RDV" value={String(honoured + visits)} sub={upcoming.length ? `Prochain : ${fmtDate(upcoming[0]!.starts_at, { day: "numeric", month: "short" })} à ${fmtTime(upcoming[0]!.starts_at)}` : "Aucun RDV à venir"} href={`/contacts/${id}?tab=rdv`} />
        <Indicator label="Abonnements actifs" value={String(activeSubs.length)} sub={activeSubs[0] ? `${activeSubs[0].name} · fin ${fmtDate(activeSubs[0].end_date, { day: "numeric", month: "short" })}` : "Aucun en cours"} href={`/contacts/${id}?tab=abonnements`} />
        <Indicator label="Client depuis" value={fmtDate(contact.created_at, { month: "short", year: "numeric" })} sub={relative(contact.created_at)} />
      </div>

      {/* Onglets */}
      <Segmented active={tab} items={TABS.map((t) => ({ id: t.id, href: `/contacts/${id}?tab=${t.id}`, label: t.label, count: counts[t.id] }))} />

      {tab === "historique" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Ajouter un échange" subtitle="Note, appel, message ou visite" />
              <div className="px-5 pb-5">
                <ActivityForm contactId={id} entities={formEntities} defaultEntity={scope.current && mine.includes(scope.current.id) ? scope.current.id : null} />
              </div>
            </Card>
            {contact.notes && (
              <Card>
                <CardHeader title="Notes internes" />
                <p className="whitespace-pre-line px-5 pb-5 text-sm text-slate-700">{contact.notes}</p>
              </Card>
            )}
          </div>
          <Card>
            <CardHeader title="Historique" subtitle={`${activities.length} événement${activities.length > 1 ? "s" : ""}`} />
            <div className="px-5 pb-5">
              <Timeline items={activities} people={people} />
            </div>
          </Card>
        </div>
      )}

      {tab === "abonnements" && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Abonnements et packs"
            subtitle={`${activeSubs.length} actif${activeSubs.length > 1 ? "s" : ""} sur ${subs.length}`}
            action={
              <LinkButton href={`/abonnements/nouveau?contact=${id}`} variant="secondary">
                <Plus /> Abonnement
              </LinkButton>
            }
          />
          {subs.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {subs.map((s) => {
                const d = daysUntil(s.end_date);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <EntityBadge id={s.entity_id} />
                        <span>
                          {fmtDate(s.start_date, { day: "numeric", month: "short" })} → {fmtDate(s.end_date)}
                        </span>
                        {s.sessions_left !== null && (
                          <span className="tabular-nums">
                            {s.sessions_left} séance{s.sessions_left > 1 ? "s" : ""} restante{s.sessions_left > 1 ? "s" : ""}
                          </span>
                        )}
                        {s.auto_renew && <span>Renouvellement auto</span>}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{mad(s.price_mad)}</span>
                    <span className="flex items-center gap-1.5">
                      {s.status === "actif" && d >= 0 && d <= 7 && <Badge tone="amber">{d === 0 ? "Fin aujourd'hui" : `Fin dans ${d} j`}</Badge>}
                      <Badge tone={SUB_TONE[s.status]} dot>
                        {SUB_STATUS_LABEL[s.status]}
                      </Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty
              icon={<CreditCard />}
              title="Aucun abonnement"
              text="Créez un abonnement ou un pack de séances pour ce client."
              action={
                <LinkButton href={`/abonnements/nouveau?contact=${id}`} variant="brand">
                  <Plus /> Créer un abonnement
                </LinkButton>
              }
            />
          )}
        </Card>
      )}

      {tab === "rdv" && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Rendez-vous"
            subtitle={`${upcoming.length} à venir · ${honoured} honorés`}
            action={
              <LinkButton href={`/agenda/nouveau?contact=${id}`} variant="secondary">
                <CalendarPlus /> Rendez-vous
              </LinkButton>
            }
          />
          {appts.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {appts.map((a) => {
                const future = a.starts_at >= nowIso;
                const staff = a.staff_id ? people.get(a.staff_id) : undefined;
                return (
                  <li key={a.id} className={cn("flex items-center gap-4 px-5 py-3", !future && (a.status === "annule" || a.status === "absent") && "opacity-60")}>
                    <span className="w-12 shrink-0 text-center">
                      <span className={cn("block text-base font-semibold leading-tight tabular-nums", future ? "text-brand-600" : "text-ink")}>{fmtDate(a.starts_at, { day: "numeric" })}</span>
                      <span className="block text-[11px] uppercase text-muted">{fmtDate(a.starts_at, { month: "short" }).replace(".", "")}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{a.service}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <EntityBadge id={a.entity_id} />
                        <span className="tabular-nums">
                          {fmtTime(a.starts_at)} · {a.duration_min} min
                        </span>
                        {staff && <span>{staff.full_name}</span>}
                        {a.room && <span>{a.room}</span>}
                      </p>
                    </div>
                    <span className="hidden text-sm tabular-nums text-slate-600 sm:block">{mad(a.price_mad)}</span>
                    <Badge tone={APPT_TONE[a.status]}>{APPT_STATUS_LABEL[a.status]}</Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty
              icon={<CalendarDays />}
              title="Aucun rendez-vous"
              text="Les rendez-vous pris pour ce client apparaîtront ici."
              action={
                <LinkButton href={`/agenda/nouveau?contact=${id}`} variant="brand">
                  <CalendarPlus /> Prendre rendez-vous
                </LinkButton>
              }
            />
          )}
        </Card>
      )}

      {tab === "achats" && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Achats"
            subtitle={`${mad(spent)} au total${due > 0 ? ` · ${mad(due)} restant dû` : ""}`}
            action={
              <LinkButton href={`/caisse?contact=${id}`} variant="secondary">
                <ShoppingCart /> Encaisser
              </LinkButton>
            }
          />
          {sales.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {sales.map((s) => {
                const lines = itemsBySale.get(s.id) ?? [];
                return (
                  <li key={s.id}>
                    <Link href={`/ventes/${s.id}`} className="group flex items-center gap-4 px-5 py-3 transition hover:bg-slate-50/70 focus-visible:bg-slate-50 focus-visible:outline-none">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm">
                          <span className="font-medium text-ink group-hover:text-brand-600">N° {s.number}</span>
                          <span className="text-xs text-muted">
                            {fmtDate(s.sold_at)} · {PAY_LABEL[s.method]}
                          </span>
                        </p>
                        <p className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted">
                          <EntityBadge id={s.entity_id} />
                          <span className="truncate">{lines.length ? lines.map((l) => `${l.qty > 1 ? `${l.qty} × ` : ""}${l.label}`).join(", ") : "Détail indisponible"}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm font-semibold tabular-nums">{mad(s.total_mad)}</span>
                        {s.status !== "payee" && <Badge tone={SALE_TONE[s.status]}>{SALE_STATUS_LABEL[s.status]}</Badge>}
                      </div>
                      <ChevronRight className="hidden size-4 shrink-0 text-slate-300 group-hover:text-slate-500 sm:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty
              icon={<Receipt />}
              title="Aucun achat"
              text="Les ventes encaissées pour ce client apparaîtront ici."
              action={
                <LinkButton href={`/caisse?contact=${id}`}>
                  <ShoppingCart /> Encaisser
                </LinkButton>
              }
            />
          )}
        </Card>
      )}

      {tab === "prospects" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-muted">Opportunités ouvertes ou clôturées pour ce contact.</p>
            <LinkButton href={`/prospects/nouveau?contact=${id}`} variant="secondary">
              <Plus /> Prospect
            </LinkButton>
          </div>
          {leads.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
              {leads.map((l) => (
                <LeadCard key={l.id} lead={l} owner={l.owner_id ? people.get(l.owner_id) : undefined} showContact={false} />
              ))}
            </div>
          ) : (
            <Card>
              <Empty
                icon={<Filter />}
                title="Aucun prospect"
                text="Créez une opportunité (essai, offre…) pour suivre ce contact dans le pipeline."
                action={
                  <LinkButton href={`/prospects/nouveau?contact=${id}`} variant="brand">
                    <Plus /> Nouveau prospect
                  </LinkButton>
                }
              />
            </Card>
          )}
        </div>
      )}


      {tab === "dossier" && <ContactDossier contact={contact} scope={scope} me={me} />}
      {tab === "fidelite" && <ContactLoyalty contact={contact} scope={scope} me={me} />}
      {tab === "carte" && <ContactAccess contact={contact} scope={scope} me={me} />}
    </div>
  );
}

function Indicator({ label, value, sub, alert, href }: { label: string; value: string; sub: string; alert?: boolean; href?: string }) {
  const body = (
    <>
      <p className="truncate text-[13px] text-muted">{label}</p>
      <p className="mt-1.5 truncate text-xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      <p className={cn("mt-1 truncate text-xs", alert ? "font-medium text-red-600" : "text-muted")}>{sub}</p>
    </>
  );
  const cls = "block min-w-0 rounded-xl border border-line bg-white p-4";
  return href ? (
    <Link href={href} scroll={false} className={cn(cls, "transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
