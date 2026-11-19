import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Hand, Inbox, MapPin, QrCode, Timer } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTeam } from "@/lib/data";
import { cn, relative } from "@/lib/utils";
import { matchesQuery } from "@/lib/search-match";
import { entity } from "@/lib/entities";
import {
  COMPLAINT_PRIORITY_LABEL,
  COMPLAINT_STATUS_LABEL,
  COMPLAINT_TYPE_LABEL,
  COMPLAINT_TYPES,
  durationLabel,
  type Complaint,
} from "@/lib/types-business";
import { resolveComplaint, takeComplaint } from "@/actions/complaints";
import { Badge, Card, Empty, LinkButton, PageHeader, Segmented, buttonClass } from "@/components/ui";
import { SolidTile } from "@/components/stat-tile";
import { EntityBadge } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { NoResults, ResultCount, clearHref, entityFilter } from "@/components/reports/list-kit";
import { PRIORITY_TONE, STATUS_TONE } from "@/components/complaints/tones";

export const metadata = { title: "Réclamations" };

type SP = { statut?: string; q?: string; etab?: string; type?: string; prio?: string; moi?: string };

export default async function ReclamationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, scope, me] = await Promise.all([searchParams, getScope(), getProfile()]);
  const supabase = await createClient();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: open }, { data: done }, team] = await Promise.all([
    supabase.from("complaints").select("*").in("entity_id", scope.ids).in("status", ["nouvelle", "en_cours"]).order("created_at", { ascending: false }),
    supabase.from("complaints").select("*").in("entity_id", scope.ids).eq("status", "resolue").gte("created_at", since).order("created_at", { ascending: false }),
    getTeam(scope),
  ]);
  const all = [...((open ?? []) as Complaint[]), ...((done ?? []) as Complaint[])];
  const people = new Map(team.map((p) => [p.id, p.full_name]));
  const ents = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const now = new Date().toISOString();

  const statut = sp.statut === "toutes" || (sp.statut && sp.statut in COMPLAINT_STATUS_LABEL) ? sp.statut : "a-traiter";
  const etab = ents.some((e) => e.id === sp.etab) ? sp.etab! : "";
  const type = sp.type && sp.type in COMPLAINT_TYPE_LABEL ? sp.type : "";
  const prio = sp.prio && sp.prio in COMPLAINT_PRIORITY_LABEL ? sp.prio : "";
  const mine = sp.moi === "1";
  const q = (sp.q ?? "").trim();
  const searched = all.filter(
    (c) =>
      (!etab || c.entity_id === etab) &&
      (!type || c.type === type) &&
      (!prio || c.priority === prio) &&
      (!mine || c.assigned_to === me.id) &&
      matchesQuery(q, c.ref, c.description, c.zone_label, c.contact_name, c.contact_phone, c.resolution, COMPLAINT_TYPE_LABEL[c.type], entity(c.entity_id)?.short, c.assigned_to ? people.get(c.assigned_to) : null),
  );
  const rank = { haute: 0, normale: 1, basse: 2 } as const;
  const list = searched
    .filter((c) => (statut === "toutes" ? true : statut === "a-traiter" ? c.status !== "resolue" : c.status === statut))
    .sort((a, b) => (a.status === "resolue") !== (b.status === "resolue") ? (a.status === "resolue" ? 1 : -1) : a.status === "resolue" ? b.created_at.localeCompare(a.created_at) : rank[a.priority] - rank[b.priority] || a.created_at.localeCompare(b.created_at));
  const filtering = !!(q || etab || type || prio || mine);

  const month = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const resolved30 = all.filter((c) => c.status === "resolue" && c.resolved_at && c.resolved_at >= month);
  const avgMin = resolved30.length ? resolved30.reduce((a, c) => a + (Date.parse(c.resolved_at!) - Date.parse(c.created_at)), 0) / resolved30.length / 60000 : 0;
  const avg = resolved30.length ? durationLabel(new Date(0).toISOString(), new Date(avgMin * 60000).toISOString()) : "—";
  const late = all.filter((c) => c.status !== "resolue" && c.priority === "haute" && Date.parse(c.created_at) < Date.now() - 24 * 3600_000).length;
  const count = (s: string) => searched.filter((c) => (s === "a-traiter" ? c.status !== "resolue" : s === "toutes" ? true : c.status === s)).length;
  const keep = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) u.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    const s = u.toString();
    return `/reclamations${s ? `?${s}` : ""}`;
  };
  const back = keep({});
  const mgmt = me.role === "direction" || me.role === "manager";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Réclamations"
        subtitle="Signalements des clients par QR code et suivi de leur traitement"
        actions={
          <>
            <LinkButton href={`/signaler${scope.current ? `?e=${scope.current.id}` : ""}`} target="_blank" variant="secondary">
              Signaler un problème
            </LinkButton>
            {mgmt && (
              <LinkButton href={`/reclamations/qr${scope.current ? `?e=${scope.current.id}` : ""}`} variant="brand">
                <QrCode /> QR codes à imprimer
              </LinkButton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Nouvelles" value={all.filter((c) => c.status === "nouvelle").length} sub="à prendre en charge" icon={<Inbox />} href={keep({ statut: "nouvelle" })} />
        <SolidTile label="En cours" value={all.filter((c) => c.status === "en_cours").length} sub={late ? `${late} urgente${late > 1 ? "s" : ""} > 24 h` : "aucune en retard"} icon={<Clock />} href={keep({ statut: "en_cours" })} />
        <SolidTile label="Résolues · 30 j" value={resolved30.length} sub="signalements traités" icon={<CheckCircle2 />} />
        <SolidTile label="Délai moyen" value={avg} sub="du signalement à la résolution" icon={<Timer />} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          items={[
            { id: "a-traiter", label: "À traiter", count: count("a-traiter"), href: keep({ statut: null }) },
            { id: "nouvelle", label: "Nouvelles", count: count("nouvelle"), href: keep({ statut: "nouvelle" }) },
            { id: "en_cours", label: "En cours", count: count("en_cours"), href: keep({ statut: "en_cours" }) },
            { id: "resolue", label: "Résolues", count: count("resolue"), href: keep({ statut: "resolue" }) },
            { id: "toutes", label: "Toutes", count: count("toutes"), href: keep({ statut: "toutes" }) },
          ]}
          active={statut}
        />
      </div>

      <Card>
        <div className="px-5 pt-4">
          <ListToolbar
            placeholder="Référence, description, zone, client…"
            filters={[
              ...entityFilter(ents),
              { param: "type", label: "Tous types", options: COMPLAINT_TYPES.map((t) => ({ value: t.id, label: t.label, count: all.filter((c) => c.type === t.id).length })).filter((o) => o.count > 0) },
              { param: "prio", label: "Toutes priorités", options: (["haute", "normale", "basse"] as const).map((p) => ({ value: p, label: COMPLAINT_PRIORITY_LABEL[p] })) },
              { param: "moi", label: "Tout le monde", options: [{ value: "1", label: "Assignées à moi" }] },
            ]}
            right={<ResultCount shown={list.length} total={all.length} filtered={filtering || statut !== "toutes"} unit="réclamation" />}
          />
        </div>
        {list.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {list.map((c) => {
              const age = durationLabel(c.created_at, c.resolved_at ?? now);
              const overdue = c.status !== "resolue" && c.priority === "haute" && Date.parse(c.created_at) < Date.now() - 24 * 3600_000;
              return (
                <li key={c.id} className="flex gap-3 px-5 py-3.5">
                  {c.photo_url ? (
                    <Link href={`/reclamations/${c.id}`} className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/reclamations/${c.id}/photo`} alt="" loading="lazy" className="size-14 rounded-lg border border-line object-cover" />
                    </Link>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/reclamations/${c.id}`} className="text-sm font-semibold tabular-nums text-ink hover:text-brand-600 hover:underline">
                        {c.ref}
                      </Link>
                      <Badge tone="gray">{COMPLAINT_TYPE_LABEL[c.type]}</Badge>
                      <Badge tone={STATUS_TONE[c.status]} dot>
                        {COMPLAINT_STATUS_LABEL[c.status]}
                      </Badge>
                      {c.priority !== "normale" && <Badge tone={PRIORITY_TONE[c.priority]}>{COMPLAINT_PRIORITY_LABEL[c.priority]}</Badge>}
                    </div>
                    <Link href={`/reclamations/${c.id}`} className="mt-1 line-clamp-2 block text-[13px] text-slate-700 hover:text-ink">
                      {c.description}
                    </Link>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
                      {ents.length > 1 && <EntityBadge id={c.entity_id} />}
                      {c.zone_label && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" /> {c.zone_label}
                        </span>
                      )}
                      <span title={new Date(c.created_at).toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" })}>{relative(c.created_at)}</span>
                      <span className={cn(overdue && "inline-flex items-center gap-1 font-medium text-red-600")}>
                        {overdue && <AlertTriangle className="size-3" />}
                        {c.status === "resolue" ? `traitée en ${age}` : `ouverte depuis ${age}`}
                      </span>
                      <span>{c.assigned_to ? `→ ${people.get(c.assigned_to) ?? "Équipe"}` : "Non assignée"}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end justify-center gap-1.5">
                    {c.status === "nouvelle" && (
                      <form action={takeComplaint.bind(null, c.id)}>
                        <button type="submit" className={buttonClass("secondary", "h-8 px-2.5")} title="Prendre en charge">
                          <Hand /> <span className="hidden sm:inline">Je m&apos;en occupe</span>
                        </button>
                      </form>
                    )}
                    {c.status !== "resolue" && (
                      <form action={resolveComplaint.bind(null, c.id, back)}>
                        <button type="submit" className={buttonClass("ghost", "h-8 px-2.5")} title="Marquer résolue">
                          <CheckCircle2 /> <span className="hidden sm:inline">Résolue</span>
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : filtering || all.length ? (
          statut === "a-traiter" && !filtering ? (
            <Empty icon={<CheckCircle2 />} title="Tout est traité" text="Aucune réclamation en attente dans votre périmètre." />
          ) : (
            <NoResults q={q} href={clearHref("/reclamations", sp, ["q", "etab", "type", "prio", "moi"])} what="réclamation" />
          )
        ) : (
          <Empty
            icon={<QrCode />}
            title="Aucune réclamation"
            text="Imprimez les QR codes et affichez-les dans vos établissements : les clients pourront signaler un problème en 30 secondes."
            action={
              mgmt ? (
                <LinkButton href="/reclamations/qr" variant="brand">
                  <QrCode /> QR codes à imprimer
                </LinkButton>
              ) : undefined
            }
          />
        )}
      </Card>
    </div>
  );
}
