import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, CircleDollarSign, CreditCard, Filter, LogIn, MapPin, Pencil, Phone, PowerOff, RotateCcw, Users } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { loadEstablishments } from "@/lib/establishments";
import { toggleEstablishment } from "@/actions/establishments";
import { ConfirmButton } from "@/components/confirm-button";
import { createClient } from "@/lib/supabase/server";
import { byId, lastMonths, monthKey } from "@/lib/data";
import { KIND_LABEL } from "@/lib/entities";
import type { Appointment, CatalogItem, CatalogKind, Contact, Lead, Profile, Sale, Subscription } from "@/lib/types";
import { APPT_STATUS_LABEL, CATALOG_KIND_LABEL, CONTACT_STATUS_LABEL, ROLE_LABEL, addDaysKey, agadirToIso, dayKey, fmtDate, fmtTime, mad, madShort } from "@/lib/utils";
import { setScope } from "../../scope-actions";
import { Avatar, Badge, Card, CardHeader, Empty, LinkButton, PageHeader } from "@/components/ui";
import { SolidTile } from "@/components/stat-tile";
import { BackLink } from "@/components/back-link";
import { EntityMark } from "@/components/entity-icon";
import { SubmitButton } from "@/components/submit-button";
import { MonthBars } from "@/components/reports/charts";
import { ContactLink } from "@/components/quick-view/contact-link";

export const metadata = { title: "Établissement" };

async function openInCrm(id: string) {
  "use server";
  await setScope(id);
  redirect("/");
}

const KINDS: CatalogKind[] = ["abonnement", "prestation", "pack", "produit"];
const link = "text-[13px] font-medium text-brand-600 hover:underline";

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, scope, me, all] = await Promise.all([params, getScope(), getProfile(), loadEstablishments()]);
  const isDirection = me.role === "direction";
  const e = scope.allowed.find((x) => x.id === id) ?? (isDirection ? all.find((x) => x.id === id) : undefined);
  if (!e) notFound();
  const supabase = await createClient();
  const today = dayKey();
  const months = lastMonths(6);
  const nowIso = new Date().toISOString();

  const [{ data: salesRaw }, { count: clients }, { data: subsRaw }, { count: rdvToday }, { data: leadsRaw }, { data: teamRaw }, { data: catalogRaw }, { data: latestRaw }, { data: nextRaw }] = await Promise.all([
    supabase.from("sales").select("*").eq("entity_id", e.id).gte("sold_at", agadirToIso(`${months[0]!.key}-01`, "00:00")),
    supabase.from("contacts").select("id", { count: "exact", head: true }).overlaps("entity_ids", [e.id]).eq("status", "client"),
    supabase.from("subscriptions").select("*").eq("entity_id", e.id).eq("status", "actif"),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("entity_id", e.id).neq("status", "annule").gte("starts_at", agadirToIso(today, "00:00")).lt("starts_at", agadirToIso(addDaysKey(today, 1), "00:00")),
    supabase.from("leads").select("*").eq("entity_id", e.id).in("stage", ["nouveau", "contacte", "essai", "offre"]),
    supabase.from("profiles").select("*").eq("active", true).order("full_name"),
    supabase.from("catalog_items").select("*").eq("entity_id", e.id).eq("active", true).order("price_mad"),
    supabase.from("contacts").select("*").overlaps("entity_ids", [e.id]).order("created_at", { ascending: false }).limit(6),
    supabase.from("appointments").select("*").eq("entity_id", e.id).neq("status", "annule").gte("starts_at", nowIso).order("starts_at").limit(8),
  ]);
  const sales = ((salesRaw ?? []) as Sale[]).filter((s) => s.status !== "remboursee");
  const subs = (subsRaw ?? []) as Subscription[];
  const leads = (leadsRaw ?? []) as Lead[];
  const team = ((teamRaw ?? []) as Profile[]).filter((p) => p.entity_ids.includes(e.id));
  const catalog = (catalogRaw ?? []) as CatalogItem[];
  const latest = (latestRaw ?? []) as Contact[];
  const next = (nextRaw ?? []) as Appointment[];
  const { data: apptContacts } = next.length ? await supabase.from("contacts").select("*").in("id", next.map((a) => a.contact_id)) : { data: [] };
  const contactById = byId(apptContacts as Contact[]);

  const byMonth = months.map((m) => ({ label: m.label, value: sales.filter((s) => monthKey(s.sold_at) === m.key).reduce((a, s) => a + Number(s.total_mad), 0) }));
  const revMonth = byMonth.at(-1)!.value;
  const revPrev = byMonth.at(-2)!.value;
  const total6 = byMonth.reduce((a, m) => a + m.value, 0);
  const pipeline = leads.reduce((a, l) => a + Number(l.value_mad), 0);
  const isCurrent = scope.current?.id === e.id;
  const trend = revPrev ? Math.round(((revMonth - revPrev) / revPrev) * 100) : null;
  const renew = subs.filter((s) => s.end_date <= addDaysKey(today, 7)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        back={<BackLink href="/etablissements" label="Établissements" />}
        title={
          <span className="flex items-center gap-3">
            <EntityMark id={e.id} size={36} />
            <span className="min-w-0">{e.name}</span>
          </span>
        }
        subtitle={
          <>
            {[KIND_LABEL[e.kind], `public ${e.audience.toLowerCase()}`, e.tagline].filter(Boolean).join(" · ")}
            {(e.address || e.phone) && (
              <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                {e.address && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-slate-400" /> {e.address}
                  </span>
                )}
                {e.phone && (
                  <a href={`tel:${e.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-brand-600">
                    <Phone className="size-3.5 text-slate-400" /> {e.phone}
                  </a>
                )}
              </span>
            )}
          </>
        }
        actions={
          <>
            {isDirection && (
              <LinkButton href={`/etablissements/${e.id}/modifier`} variant="secondary">
                <Pencil /> Modifier
              </LinkButton>
            )}
            {e.active === false ? (
              <>
                <Badge tone="gray" dot>
                  Désactivé
                </Badge>
                <form action={toggleEstablishment.bind(null, e.id)}>
                  <SubmitButton variant="brand" pendingText="Réactivation…">
                    <RotateCcw /> Réactiver
                  </SubmitButton>
                </form>
              </>
            ) : isCurrent ? (
              <Badge tone="brand" dot>
                Affiché dans le CRM
              </Badge>
            ) : (
              <form action={openInCrm.bind(null, e.id)}>
                <SubmitButton variant="brand" pendingText="Ouverture…">
                  <LogIn /> Ouvrir dans le CRM
                </SubmitButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile
          label="CA du mois"
          value={madShort(revMonth)}
          sub={revPrev ? "vs mois dernier" : "Premier mois"}
          icon={<CircleDollarSign />}
          series={byMonth.map((m) => m.value)}
          trendLabel={trend === null ? undefined : `${trend > 0 ? "+" : ""}${trend} %`}
          trendUp={trend === null || trend === 0 ? null : trend > 0}
        />
        <SolidTile label="Clients" value={clients ?? 0} sub={latest[0] ? `Dernier : ${latest[0].full_name.split(" ")[0]}` : "Aucun client"} icon={<Users />} />
        <SolidTile label="Abonnés actifs" value={subs.length} sub={`${renew} à renouveler sous 7 j`} icon={<CreditCard />} href="/abonnements?filtre=expire-bientot" />
        <SolidTile label="RDV du jour" value={rdvToday ?? 0} sub={next[0] ? `Prochain à ${fmtTime(next[0].starts_at)}` : "Rien de prévu"} icon={<CalendarDays />} href="/agenda" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader title="Chiffre d'affaires" subtitle={`6 derniers mois · ${mad(total6)}`} />
          <div className="px-3 pb-5 sm:px-5">
            <MonthBars data={byMonth} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Équipe" subtitle={`${team.length} membre${team.length > 1 ? "s" : ""}`} />
          {team.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {team.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={p.full_name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.full_name}</p>
                    <p className="truncate text-xs text-muted">{p.job_title ?? ROLE_LABEL[p.role]}</p>
                  </div>
                  {p.phone && (
                    <a
                      href={`tel:${p.phone.replace(/\s/g, "")}`}
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink"
                      aria-label={`Appeler ${p.full_name}`}
                    >
                      <Phone className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Users />} title="Aucun membre rattaché" text="La direction attribue les établissements depuis la page Équipe." />
          )}
        </Card>
      </div>

      {/* Catalogue */}
      <Card>
        <CardHeader
          title="Catalogue"
          subtitle={`${catalog.length} article${catalog.length > 1 ? "s" : ""} actif${catalog.length > 1 ? "s" : ""} · ${leads.length} prospects ouverts (${madShort(pipeline)} potentiels)`}
          action={
            <Link href="/catalogue" className={link}>
              Gérer
            </Link>
          }
        />
        {catalog.length ? (
          <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
            {KINDS.map((k) => {
              const list = catalog.filter((c) => c.kind === k);
              if (!list.length) return null;
              const prices = list.map((c) => Number(c.price_mad));
              const min = Math.min(...prices);
              const max = Math.max(...prices);
              return (
                <div key={k} className="bg-white p-4 sm:px-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[13px] font-semibold text-ink">{CATALOG_KIND_LABEL[k]}</p>
                    <span className="text-xs tabular-nums text-muted">{list.length}</span>
                  </div>
                  <p className="mt-0.5 text-xs tabular-nums text-muted">{min === max ? mad(min) : `${mad(min)} à ${mad(max)}`}</p>
                  <ul className="mt-2.5 space-y-1">
                    {list.slice(0, 4).map((c) => (
                      <li key={c.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="truncate text-slate-700">{c.name}</span>
                        <span className="shrink-0 font-medium tabular-nums">{madShort(Number(c.price_mad))}</span>
                      </li>
                    ))}
                    {list.length > 4 && <li className="text-xs text-muted">+ {list.length - 4} autres</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={<Filter />} title="Aucun article actif" action={<Link href="/catalogue/nouveau" className={link}>Ajouter un article</Link>} />
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title="Derniers clients" subtitle="Contacts ajoutés récemment" />
          {latest.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {latest.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={c.full_name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <ContactLink id={c.id} name={c.full_name} />
                    </p>
                    <p className="truncate text-xs text-muted">
                      {CONTACT_STATUS_LABEL[c.status]} · depuis le {fmtDate(c.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Users />} title="Aucun client" />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Prochains rendez-vous"
            subtitle="À partir de maintenant"
            action={
              <Link href="/agenda" className={link}>
                Agenda
              </Link>
            }
          />
          {next.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {next.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-14 shrink-0">
                    <span className="block text-sm font-semibold tabular-nums text-ink">{fmtTime(a.starts_at)}</span>
                    <span className="block text-xs capitalize text-muted">{dayKey(a.starts_at) === today ? "Aujourd'hui" : fmtDate(a.starts_at, { weekday: "short", day: "numeric" })}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {a.contact_id ? <ContactLink id={a.contact_id} name={contactById.get(a.contact_id)?.full_name ?? "Client"} /> : <span className="font-medium">Client</span>}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {a.service} · {a.duration_min} min
                    </p>
                  </div>
                  <Badge tone={a.status === "confirme" ? "brand" : a.status === "arrive" ? "green" : "gray"}>{APPT_STATUS_LABEL[a.status]}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<CalendarDays />} title="Aucun rendez-vous à venir" />
          )}
        </Card>
      </div>

      {isDirection && e.active !== false && all.filter((x) => x.active !== false).length > 1 && (
        <details className="rounded-xl border border-line bg-white">
          <summary className="cursor-pointer list-none px-5 py-3 text-[13px] font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">Désactiver cet établissement</summary>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
            <p className="max-w-xl text-[13px] text-muted">Il disparaît des sélecteurs, de la caisse et des listes. Les clients, ventes et stocks sont conservés ; vous pourrez le réactiver à tout moment.</p>
            <form action={toggleEstablishment.bind(null, e.id)}>
              <ConfirmButton message={`Désactiver ${e.short} ? Ses données sont conservées.`} className="h-9">
                <PowerOff className="size-4" /> Désactiver
              </ConfirmButton>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}
