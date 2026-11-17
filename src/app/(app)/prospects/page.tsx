import Link from "next/link";
import { BellRing, CircleDollarSign, Filter, Percent, Plus, X } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getTeam } from "@/lib/data";
import { addDaysKey, dayKey, mad, madShort, pct, STAGES } from "@/lib/utils";
import type { Contact, Lead, LeadSource } from "@/lib/types";
import { SolidTile } from "@/components/stat-tile";
import { Card, Empty, Field, LinkButton, PageHeader } from "@/components/ui";
import { AutoSelect } from "@/components/contacts/auto-select";
import { param, SOURCES } from "@/components/contacts/helpers";
import { LeadCard } from "@/components/leads/lead-card";

export const metadata = { title: "Prospects" };

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const supabase = await createClient();
  const today = dayKey();
  const since30 = addDaysKey(today, -30);

  const sourceRaw = param(sp.source);
  const source = SOURCES.some(([k]) => k === sourceRaw) ? (sourceRaw as LeadSource) : undefined;
  const owner = param(sp.responsable);

  let q = supabase.from("leads").select("*").in("entity_id", scope.ids);
  if (source) q = q.eq("source", source);
  if (owner) q = owner === "aucun" ? q.is("owner_id", null) : q.eq("owner_id", owner);
  const [{ data: leadsRaw }, team] = await Promise.all([q.order("updated_at", { ascending: false }), getTeam(scope)]);
  const all = (leadsRaw ?? []) as Lead[];

  const { data: contactRows } = all.length ? await supabase.from("contacts").select("*").in("id", [...new Set(all.map((l) => l.contact_id))]) : { data: [] };
  const contacts = byId(contactRows as Contact[]);
  const people = byId(team);

  /* Indicateurs */
  const open = all.filter((l) => l.stage !== "gagne" && l.stage !== "perdu");
  const potential = open.reduce((a, l) => a + Number(l.value_mad), 0);
  const toFollow = open.filter((l) => l.next_action_on && l.next_action_on <= today);
  const late = toFollow.filter((l) => l.next_action_on! < today).length;
  const won30 = all.filter((l) => l.stage === "gagne" && l.updated_at >= since30);
  const closed30 = all.filter((l) => (l.stage === "gagne" || l.stage === "perdu") && l.updated_at >= since30).length;

  // Colonnes : prospects ouverts triés par échéance, gagnés / perdus des 30 derniers jours
  const columns = STAGES.map((s) => {
    let rows = all.filter((l) => l.stage === s.id);
    if (s.id === "gagne" || s.id === "perdu") rows = rows.filter((l) => l.updated_at >= since30);
    else rows = rows.sort((a, b) => (a.next_action_on ?? "9999") < (b.next_action_on ?? "9999") ? -1 : 1);
    return { ...s, rows, value: rows.reduce((a, l) => a + Number(l.value_mad), 0) };
  });
  const filtered = !!(source || owner);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospects"
        subtitle="Suivez chaque opportunité, du premier contact à l'inscription."
        actions={
          <LinkButton href="/prospects/nouveau">
            <Plus className="size-4" /> Nouveau prospect
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile tone="brand" label="En cours" value={open.length} sub={`${all.length} prospects au total`} icon={<Filter />} watermark={<Filter />} />
        <SolidTile tone="accent" label="Valeur potentielle" value={madShort(potential)} sub={mad(potential)} icon={<CircleDollarSign />} watermark={<CircleDollarSign />} />
        <SolidTile
          tone="violet"
          label="À relancer"
          value={toFollow.length}
          sub={late ? `Dont ${late} en retard` : "Échéance aujourd'hui ou passée"}
          icon={<BellRing />}
          watermark={<BellRing />}
          trendLabel={late ? `${late} en retard` : undefined}
          trendUp={late ? false : null}
        />
        <SolidTile
          tone="green"
          label="Conversion 30 j"
          value={`${pct(won30.length, closed30)} %`}
          sub={closed30 ? `${won30.length} gagnés sur ${closed30} clôturés` : "Aucun prospect clôturé"}
          icon={<Percent />}
          watermark={<Percent />}
        />
      </div>

      {/* Filtres */}
      <Card className="p-4">
        <form action="/prospects" className="flex flex-wrap items-end gap-3">
          <Field label="Source" className="min-w-[160px] flex-1 sm:max-w-[240px]">
            <AutoSelect name="source" defaultValue={source ?? ""}>
              <option value="">Toutes les sources</option>
              {SOURCES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </AutoSelect>
          </Field>
          <Field label="Responsable" className="min-w-[160px] flex-1 sm:max-w-[240px]">
            <AutoSelect name="responsable" defaultValue={owner ?? ""}>
              <option value="">Toute l&apos;équipe</option>
              <option value="aucun">Sans responsable</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </AutoSelect>
          </Field>
          <noscript>
            <button type="submit" className="h-11 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white">
              Filtrer
            </button>
          </noscript>
          {filtered && (
            <Link href="/prospects" className="inline-flex h-11 items-center gap-1 text-sm font-semibold text-brand-500 hover:underline">
              <X className="size-4" /> Effacer
            </Link>
          )}
        </form>
      </Card>

      {all.length === 0 ? (
        <Card>
          <Empty
            icon={<Filter className="size-6" />}
            title={filtered ? "Aucun prospect pour ces filtres" : "Aucun prospect pour l'instant"}
            text="Ajoutez les personnes intéressées (Instagram, passage, téléphone…) pour ne plus en oublier."
            action={
              <LinkButton href="/prospects/nouveau">
                <Plus className="size-4" /> Nouveau prospect
              </LinkButton>
            }
          />
        </Card>
      ) : (
        /* Pipeline : seul ce conteneur défile horizontalement */
        <div className="overflow-x-auto pb-3">
          <div className="flex w-max gap-4">
            {columns.map((col) => (
              <section key={col.id} className="flex w-[280px] shrink-0 flex-col rounded-3xl bg-white/60 p-2.5 ring-1 ring-line">
                <header className="mb-2.5 overflow-hidden rounded-2xl text-white shadow-sm" style={{ background: col.tone }}>
                  <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
                    <h2 className="truncate font-display text-sm font-bold">{col.label}</h2>
                    <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white/25 px-1.5 text-xs font-extrabold">{col.rows.length}</span>
                  </div>
                  <p className="px-3.5 pb-3 pt-0.5 text-xs font-semibold text-white/85">
                    {mad(col.value)}
                    {(col.id === "gagne" || col.id === "perdu") && " · 30 derniers jours"}
                  </p>
                </header>
                <div className="flex flex-1 flex-col gap-2.5">
                  {col.rows.length ? (
                    col.rows.map((l) => <LeadCard key={l.id} lead={l} contact={contacts.get(l.contact_id)} owner={l.owner_id ? people.get(l.owner_id) : undefined} />)
                  ) : (
                    <p className="rounded-2xl border-2 border-dashed border-line px-3 py-6 text-center text-xs text-muted">Aucun prospect</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
