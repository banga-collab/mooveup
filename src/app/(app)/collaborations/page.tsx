import Link from "next/link";
import { BellRing, CalendarRange, Camera, Handshake, Plus, Sparkles, Wallet } from "lucide-react";
import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDaysKey, dayKey, daysUntil, fmtDate, mad } from "@/lib/utils";
import { matchesQuery } from "@/lib/search-match";
import { NATURE_LABEL, PARTNER_KIND_LABEL, PARTNERSHIP_STATUS_LABEL, type Partnership } from "@/lib/types-business";
import { Badge, Card, CardHeader, Empty, LinkButton, PageHeader, Segmented } from "@/components/ui";
import { SolidTile } from "@/components/stat-tile";
import { EntityDots } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { NoResults, ResultCount, clearHref, entityFilter } from "@/components/reports/list-kit";
import { STATUS_TONE } from "@/components/collaborations/partnership-form";

export const metadata = { title: "Collaborations" };

type SP = { statut?: string; q?: string; etab?: string; nature?: string; type?: string };

const period = (p: Partnership) =>
  p.start_date && p.end_date ? `${fmtDate(p.start_date, { day: "numeric", month: "short" })} → ${fmtDate(p.end_date)}` : p.start_date ? `Depuis le ${fmtDate(p.start_date)}` : p.end_date ? `Jusqu'au ${fmtDate(p.end_date)}` : "Dates à définir";

export default async function CollaborationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireManager();
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("partnerships").select("*").order("created_at", { ascending: false });
  const all = ((data ?? []) as Partnership[]).filter((p) => !(p.entity_ids ?? []).length || p.entity_ids.some((e) => scope.ids.includes(e)));
  const ents = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const today = dayKey();
  const soon = addDaysKey(today, 30);

  const statut = sp.statut && sp.statut in PARTNERSHIP_STATUS_LABEL ? sp.statut : "toutes";
  const etab = ents.some((e) => e.id === sp.etab) ? sp.etab! : "";
  const nature = sp.nature && sp.nature in NATURE_LABEL ? sp.nature : "";
  const kind = sp.type && sp.type in PARTNER_KIND_LABEL ? sp.type : "";
  const q = (sp.q ?? "").trim();
  const searched = all.filter(
    (p) =>
      (!etab || !(p.entity_ids ?? []).length || p.entity_ids.includes(etab as never)) &&
      (!nature || p.nature === nature) &&
      (!kind || p.partner_kind === kind) &&
      matchesQuery(q, p.title, p.partner_name, p.contact_name, p.social, p.our_part, p.their_part, p.results, p.notes, NATURE_LABEL[p.nature], PARTNER_KIND_LABEL[p.partner_kind]),
  );
  const order = { active: 0, discussion: 1, terminee: 2 } as const;
  const list = searched
    .filter((p) => statut === "toutes" || p.status === statut)
    .sort((a, b) => order[a.status] - order[b.status] || (a.status === "terminee" ? (b.end_date ?? "").localeCompare(a.end_date ?? "") : (a.end_date ?? "9999").localeCompare(b.end_date ?? "9999")));
  const filtering = !!(q || etab || nature || kind);

  const actives = all.filter((p) => p.status === "active");
  const watch = all
    .filter((p) => p.status !== "terminee" && ((p.status === "active" && p.end_date && p.end_date <= soon) || (p.reminder_date && p.reminder_date <= addDaysKey(today, 7))))
    .sort((a, b) => (a.end_date ?? a.reminder_date ?? "").localeCompare(b.end_date ?? b.reminder_date ?? ""));
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const yearCount = all.filter((p) => p.status !== "discussion" && (p.start_date ?? p.created_at.slice(0, 10)) >= yearStart).length;

  const keep = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) u.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    const s = u.toString();
    return `/collaborations${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Collaborations"
        subtitle="Partenariats, sponsoring, influence et événements"
        actions={
          <LinkButton href="/collaborations/nouvelle" variant="brand">
            <Plus /> Nouvelle collaboration
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Actives" value={actives.length} sub={`${all.filter((p) => p.status === "discussion").length} en discussion`} icon={<Handshake />} href="/collaborations?statut=active" />
        <SolidTile label="Valeur des actives" value={mad(actives.reduce((a, p) => a + Number(p.value_mad ?? 0), 0))} sub="estimation" icon={<Wallet />} />
        <SolidTile label="À surveiller" value={watch.length} sub="fin ou rappel proche" icon={<BellRing />} />
        <SolidTile label={`Lancées en ${today.slice(0, 4)}`} value={yearCount} sub="actives ou terminées" icon={<Sparkles />} />
      </div>

      {watch.length > 0 && (
        <Card>
          <CardHeader title="À surveiller" subtitle="Échéances dans les 30 jours et rappels de la semaine" icon={<BellRing />} />
          <ul className="divide-y divide-line border-t border-line">
            {watch.slice(0, 6).map((p) => {
              const d = p.end_date ? daysUntil(p.end_date) : null;
              return (
                <li key={p.id}>
                  <Link href={`/collaborations/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 text-[13px] hover:bg-slate-50">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-ink">{p.partner_name}</span> <span className="text-muted">· {NATURE_LABEL[p.nature]}</span>
                    </span>
                    {d !== null && p.status === "active" ? (
                      <Badge tone={d < 0 ? "red" : d <= 7 ? "amber" : "gray"}>{d < 0 ? `Terminée depuis ${-d} j` : d === 0 ? "Se termine aujourd'hui" : `Fin dans ${d} j`}</Badge>
                    ) : (
                      p.reminder_date && <Badge tone="brand">Rappel {fmtDate(p.reminder_date, { day: "numeric", month: "short" })}</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Segmented
        items={[
          { id: "toutes", label: "Toutes", count: searched.length, href: keep({ statut: null }) },
          ...(["active", "discussion", "terminee"] as const).map((s) => ({ id: s, label: PARTNERSHIP_STATUS_LABEL[s], count: searched.filter((p) => p.status === s).length, href: keep({ statut: s }) })),
        ]}
        active={statut}
      />

      {all.length > 0 && (
        <ListToolbar
          placeholder="Partenaire, conditions, résultats…"
          filters={[
            ...entityFilter(ents),
            { param: "nature", label: "Toutes natures", options: Object.entries(NATURE_LABEL).map(([k, v]) => ({ value: k, label: v, count: all.filter((p) => p.nature === k).length })).filter((o) => o.count > 0) },
            { param: "type", label: "Tous partenaires", options: Object.entries(PARTNER_KIND_LABEL).map(([k, v]) => ({ value: k, label: v, count: all.filter((p) => p.partner_kind === k).length })).filter((o) => o.count > 0) },
          ]}
          right={<ResultCount shown={list.length} total={all.length} filtered={filtering || statut !== "toutes"} unit="collaboration" />}
        />
      )}

      {list.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {list.map((p) => (
            <li key={p.id}>
              <Link href={`/collaborations/${p.id}`} className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-white transition hover:border-slate-300">
                {p.photos?.length ? (
                  <span className="relative block aspect-[16/7] bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/collaborations/${p.id}/photo/0`} alt="" loading="lazy" className="size-full object-cover" />
                    {p.photos.length > 1 && (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                        <Camera className="size-3" /> {p.photos.length}
                      </span>
                    )}
                  </span>
                ) : null}
                <span className="flex flex-1 flex-col p-4">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{p.title}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {p.partner_name} · {PARTNER_KIND_LABEL[p.partner_kind]}
                      </span>
                    </span>
                    <Badge tone={STATUS_TONE[p.status]} dot>
                      {PARTNERSHIP_STATUS_LABEL[p.status]}
                    </Badge>
                  </span>
                  <span className="mt-3 flex items-center gap-1.5 text-[13px] text-slate-600">
                    <CalendarRange className="size-3.5 text-slate-400" /> {period(p)}
                  </span>
                  {(p.their_part || p.our_part) && <span className="mt-2 line-clamp-2 text-[13px] text-slate-600">{p.their_part ?? p.our_part}</span>}
                  <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-muted">
                    <span className="flex items-center gap-2">
                      <Badge tone="gray">{NATURE_LABEL[p.nature]}</Badge>
                      {(p.entity_ids ?? []).length ? <EntityDots ids={p.entity_ids} /> : <span>Groupe</span>}
                    </span>
                    {p.value_mad ? <span className="font-semibold tabular-nums text-ink">{mad(Number(p.value_mad))}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : all.length ? (
        <Card>
          <NoResults q={q} href={clearHref("/collaborations", sp, ["q", "etab", "nature", "type", "statut"])} what="collaboration" />
        </Card>
      ) : (
        <Card>
          <Empty
            icon={<Handshake />}
            title="Aucune collaboration"
            text="Suivez vos partenariats (marques, influenceurs, associations…) : conditions, dates, photos et résultats."
            action={
              <LinkButton href="/collaborations/nouvelle" variant="brand">
                <Plus /> Nouvelle collaboration
              </LinkButton>
            }
          />
        </Card>
      )}
    </div>
  );
}
