import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  CircleDollarSign,
  Clock,
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
import { entity } from "@/lib/entities";
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
import { Badge, Card, CardHeader, Empty, LinkButton } from "@/components/ui";
import { EntityBadge, EntityMark, shade } from "@/components/entity-icon";
import { ConfirmButton } from "@/components/confirm-button";
import { BackLink } from "@/components/back-link";
import { StatusBadge, WhatsAppButton } from "@/components/contacts/bits";
import { ActivityForm, Timeline } from "@/components/contacts/timeline";
import { LeadCard } from "@/components/leads/lead-card";
import { param } from "@/components/contacts/helpers";

export const metadata = { title: "Fiche client" };

const TABS = [
  { id: "historique", label: "Historique", icon: History },
  { id: "abonnements", label: "Abonnements", icon: CreditCard },
  { id: "rdv", label: "Rendez-vous", icon: CalendarDays },
  { id: "achats", label: "Achats", icon: Receipt },
  { id: "prospects", label: "Prospects", icon: Filter },
] as const;
type TabId = (typeof TABS)[number]["id"];

const SUB_TONE = { actif: "green", suspendu: "amber", expire: "gray", resilie: "red" } as const;
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
  const items = (itemsRaw ?? []) as SaleItem[];

  /* Indicateurs */
  const spent = sales.filter((s) => s.status !== "remboursee").reduce((a, s) => a + Number(s.total_mad), 0);
  const due = sales.filter((s) => s.status === "impayee" || s.status === "partielle").reduce((a, s) => a + Number(s.total_mad) - Number(s.paid_mad), 0);
  const nowIso = new Date().toISOString();
  const honoured = appts.filter((a) => a.status === "arrive" || a.status === "termine").length;
  const visits = activities.filter((a) => a.kind === "visite").length;
  const upcoming = appts.filter((a) => a.starts_at >= nowIso && a.status !== "annule").sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
  const activeSubs = subs.filter((s) => s.status === "actif");

  /* En-tête aux couleurs du premier établissement visible */
  const mine = contact.entity_ids.filter((e) => allowedIds.includes(e));
  const main = entity(scope.current && mine.includes(scope.current.id) ? scope.current.id : mine[0]) ?? scope.allowed[0]!;
  const canDelete = me.role === "direction" || me.role === "manager";
  const years = age(contact.birth_date);
  const hiddenScope = scope.current && !contact.entity_ids.includes(scope.current.id);
  const formEntities = scope.allowed.filter((e) => mine.includes(e.id));

  const counts: Record<TabId, number> = { historique: activities.length, abonnements: subs.length, rdv: appts.length, achats: sales.length, prospects: leads.length };

  return (
    <div className="space-y-6">
      <BackLink href="/contacts" label="Clients & contacts" />

      {/* En-tête coloré */}
      <section
        className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl animate-fade-up sm:p-7"
        style={{ background: `linear-gradient(135deg, ${shade(main.color, -25)}, ${main.color} 55%, ${shade(main.color, 18)})` }}
      >
        <span className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full bg-white/10" />
        <span className="pointer-events-none absolute -bottom-16 right-24 size-40 rounded-full bg-white/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/20 font-display text-2xl font-extrabold ring-2 ring-white/40 sm:size-20 sm:text-3xl">
              {contact.full_name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase())
                .join("")}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 break-words font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{contact.full_name}</h1>
                <span className="rounded-full bg-white px-0.5 py-0.5">
                  <StatusBadge status={contact.status} />
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
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
              <div className="mt-3 flex flex-wrap gap-1.5">
                {contact.entity_ids.map((e) => (
                  <EntityBadge key={e} id={e} />
                ))}
              </div>
              {contact.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {contact.tags.map((t) => (
                    <span key={t} className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ring-white/30">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {contact.phone && (
                  <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/20 px-3 text-sm font-semibold ring-1 ring-white/30 transition hover:bg-white/30">
                    <Phone className="size-4" /> {contact.phone}
                  </a>
                )}
                {contact.whatsapp_optin && <WhatsAppButton phone={contact.phone} label="WhatsApp" text={`Bonjour ${contact.full_name.split(" ")[0]},`} className="h-9 px-3 text-sm" />}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="inline-flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-xl bg-white/20 px-3 text-sm font-semibold ring-1 ring-white/30 transition hover:bg-white/30">
                    <Mail className="size-4 shrink-0" /> <span className="truncate">{contact.email}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-[340px] lg:justify-end">
            <Link href={`/agenda/nouveau?contact=${id}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-3.5 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5">
              <CalendarPlus className="size-4" style={{ color: main.color }} /> Nouveau RDV
            </Link>
            <Link href={`/caisse?contact=${id}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent-500 px-3.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-accent-600">
              <ShoppingCart className="size-4" /> Encaisser
            </Link>
            <Link href={`/abonnements/nouveau?contact=${id}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/20 px-3.5 text-sm font-bold ring-1 ring-white/30 transition hover:bg-white/30">
              <CreditCard className="size-4" /> Abonnement
            </Link>
            <Link href={`/contacts/${id}/modifier`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/20 px-3.5 text-sm font-bold ring-1 ring-white/30 transition hover:bg-white/30">
              <Pencil className="size-4" /> Modifier
            </Link>
            {canDelete && (
              <form action={deleteContact.bind(null, id)}>
                <ConfirmButton
                  message={
                    contact.entity_ids.some((e) => !allowedIds.includes(e))
                      ? `${contact.full_name} fréquente aussi d'autres établissements : la fiche sera seulement retirée des vôtres. Continuer ?`
                      : `Supprimer définitivement ${contact.full_name} et tout son historique ? Cette action est irréversible.`
                  }
                  className="h-10 rounded-xl px-3"
                >
                  <Trash2 className="size-4" /> <span className="sr-only sm:not-sr-only">Supprimer</span>
                </ConfirmButton>
              </form>
            )}
          </div>
        </div>
      </section>

      {hiddenScope && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ce contact ne fréquente pas {scope.current!.short} : seules les données de cet établissement sont affichées. Choisissez « Tous » dans le sélecteur pour voir tout son historique.
        </p>
      )}

      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Indicator icon={<CircleDollarSign className="size-5" />} color="#e8782a" label="Total dépensé" value={mad(spent)} sub={due > 0 ? `Reste dû : ${mad(due)}` : `${sales.length} achat${sales.length > 1 ? "s" : ""}`} alert={due > 0} />
        <Indicator icon={<CalendarCheck className="size-5" />} color="#1a6d8e" label="Visites & RDV" value={String(honoured + visits)} sub={upcoming.length ? `Prochain : ${fmtDate(upcoming[0]!.starts_at, { day: "numeric", month: "short" })} à ${fmtTime(upcoming[0]!.starts_at)}` : "Aucun RDV à venir"} />
        <Indicator icon={<CreditCard className="size-5" />} color="#059669" label="Abonnements actifs" value={String(activeSubs.length)} sub={activeSubs[0] ? `${activeSubs[0].name} · fin ${fmtDate(activeSubs[0].end_date, { day: "numeric", month: "short" })}` : "Aucun en cours"} />
        <Indicator icon={<Clock className="size-5" />} color="#7c4dcc" label="Client depuis" value={fmtDate(contact.created_at, { month: "short", year: "numeric" })} sub={relative(contact.created_at)} />
      </div>

      {/* Onglets */}
      <div className="overflow-x-auto">
        <nav className="flex w-max gap-1 rounded-2xl border border-line bg-white p-1 shadow-card">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = t.id === tab;
            return (
              <Link
                key={t.id}
                href={`/contacts/${id}?tab=${t.id}`}
                scroll={false}
                className={cn("inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition", on ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25" : "text-slate-600 hover:bg-canvas")}
              >
                <Icon className="size-4" /> {t.label}
                <span className={cn("rounded-full px-1.5 text-[11px] font-bold", on ? "bg-white/25" : "bg-canvas text-muted")}>{counts[t.id]}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {tab === "historique" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Ajouter un échange" subtitle="Note, appel, message ou visite" icon={<Plus className="size-4" />} />
              <div className="px-5 pb-5">
                <ActivityForm contactId={id} entities={formEntities} defaultEntity={scope.current && mine.includes(scope.current.id) ? scope.current.id : null} />
              </div>
            </Card>
            {contact.notes && (
              <Card className="p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Notes internes</p>
                <p className="mt-2 whitespace-pre-line text-sm text-ink">{contact.notes}</p>
              </Card>
            )}
          </div>
          <Card className="p-5">
            <Timeline items={activities} people={people} />
          </Card>
        </div>
      )}

      {tab === "abonnements" && (
        <Card>
          <CardHeader
            title="Abonnements et packs"
            subtitle={`${activeSubs.length} actif${activeSubs.length > 1 ? "s" : ""}`}
            icon={<CreditCard className="size-4" />}
            action={
              <LinkButton href={`/abonnements/nouveau?contact=${id}`} className="h-9">
                <Plus className="size-4" /> Nouveau
              </LinkButton>
            }
          />
          {subs.length ? (
            <ul className="divide-y divide-line px-2 pb-3">
              {subs.map((s) => {
                const d = daysUntil(s.end_date);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                    <EntityMark id={s.entity_id} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="text-xs text-muted">
                        Du {fmtDate(s.start_date)} au {fmtDate(s.end_date)}
                        {s.sessions_left !== null && ` · ${s.sessions_left} séance${s.sessions_left > 1 ? "s" : ""} restante${s.sessions_left > 1 ? "s" : ""}`}
                        {s.auto_renew && " · renouvellement auto"}
                      </p>
                    </div>
                    <span className="font-display text-sm font-extrabold">{mad(s.price_mad)}</span>
                    <span className="flex items-center gap-1.5">
                      {s.status === "actif" && d >= 0 && d <= 7 && <Badge tone="red">{d === 0 ? "Fin aujourd'hui" : `Fin dans ${d} j`}</Badge>}
                      <Badge tone={SUB_TONE[s.status]} dot>
                        {SUB_STATUS_LABEL[s.status]}
                      </Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={<CreditCard className="size-6" />} title="Aucun abonnement" text="Créez un abonnement ou un pack de séances pour ce client." />
          )}
        </Card>
      )}

      {tab === "rdv" && (
        <Card>
          <CardHeader
            title="Rendez-vous"
            subtitle={`${upcoming.length} à venir · ${honoured} honorés`}
            icon={<CalendarDays className="size-4" />}
            action={
              <LinkButton href={`/agenda/nouveau?contact=${id}`} variant="brand" className="h-9">
                <CalendarPlus className="size-4" /> Nouveau
              </LinkButton>
            }
          />
          {appts.length ? (
            <ul className="divide-y divide-line px-2 pb-3">
              {appts.map((a) => {
                const future = a.starts_at >= nowIso;
                return (
                  <li key={a.id} className={cn("flex items-center gap-3 px-3 py-3", !future && (a.status === "annule" || a.status === "absent") && "opacity-60")}>
                    <span className={cn("w-14 shrink-0 rounded-xl py-1.5 text-center", future ? "bg-accent-50 text-accent-700" : "bg-canvas text-slate-600")}>
                      <span className="block font-display text-sm font-extrabold">{fmtDate(a.starts_at, { day: "numeric" })}</span>
                      <span className="block text-[10.5px] font-semibold uppercase">{fmtDate(a.starts_at, { month: "short" }).replace(".", "")}</span>
                    </span>
                    <EntityMark id={a.entity_id} size={34} className="hidden sm:grid" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{a.service}</p>
                      <p className="truncate text-xs text-muted">
                        {fmtTime(a.starts_at)} · {a.duration_min} min
                        {a.staff_id && people.get(a.staff_id) ? ` · ${people.get(a.staff_id)!.full_name}` : ""}
                        {a.room ? ` · ${a.room}` : ""}
                      </p>
                    </div>
                    <span className="hidden font-display text-sm font-bold text-slate-600 sm:block">{mad(a.price_mad)}</span>
                    <Badge tone={APPT_TONE[a.status]}>{APPT_STATUS_LABEL[a.status]}</Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={<CalendarDays className="size-6" />} title="Aucun rendez-vous" text="Les rendez-vous pris pour ce client apparaîtront ici." />
          )}
        </Card>
      )}

      {tab === "achats" && (
        <Card>
          <CardHeader
            title="Achats"
            subtitle={`${mad(spent)} au total`}
            icon={<Receipt className="size-4" />}
            action={
              <LinkButton href={`/caisse?contact=${id}`} className="h-9">
                <ShoppingCart className="size-4" /> Encaisser
              </LinkButton>
            }
          />
          {sales.length ? (
            <ul className="divide-y divide-line px-2 pb-3">
              {sales.map((s) => {
                const lines = items.filter((i) => i.sale_id === s.id);
                return (
                  <li key={s.id}>
                    <Link href={`/ventes/${s.id}`} className="group flex items-start gap-3 rounded-xl px-3 py-3 transition hover:bg-canvas">
                      <EntityMark id={s.entity_id} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm">
                          <span className="font-semibold">N° {s.number}</span>
                          <span className="text-xs text-muted">
                            {fmtDate(s.sold_at)} · {PAY_LABEL[s.method]}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-600">{lines.length ? lines.map((l) => `${l.qty > 1 ? `${l.qty} × ` : ""}${l.label}`).join(", ") : "Détail indisponible"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-display text-sm font-extrabold">{mad(s.total_mad)}</span>
                        <Badge tone={SALE_TONE[s.status]}>{SALE_STATUS_LABEL[s.status]}</Badge>
                      </div>
                      <ChevronRight className="mt-2 hidden size-4 shrink-0 text-slate-300 group-hover:text-brand-500 sm:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={<Receipt className="size-6" />} title="Aucun achat" text="Les ventes encaissées pour ce client apparaîtront ici." />
          )}
        </Card>
      )}

      {tab === "prospects" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">Opportunités ouvertes ou clôturées pour ce contact.</p>
            <LinkButton href={`/prospects/nouveau?contact=${id}`}>
              <Plus className="size-4" /> Nouveau prospect
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
              <Empty icon={<Filter className="size-6" />} title="Aucun prospect" text="Créez une opportunité (essai, offre…) pour suivre ce contact dans le pipeline." />
            </Card>
          )}
        </div>
      )}

    </div>
  );
}

function Indicator({ icon, color, label, value, sub, alert }: { icon: React.ReactNode; color: string; label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-white p-4 shadow-card">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <span className="grid size-10 place-items-center rounded-xl text-white shadow-sm" style={{ background: color }}>
        {icon}
      </span>
      <p className="mt-3 truncate font-display text-xl font-extrabold tracking-tight sm:text-2xl">{value}</p>
      <p className="text-[13px] font-semibold text-slate-600">{label}</p>
      <p className={cn("mt-0.5 truncate text-xs", alert ? "font-semibold text-red-600" : "text-muted")}>{sub}</p>
    </div>
  );
}
