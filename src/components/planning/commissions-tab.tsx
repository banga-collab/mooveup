import { Download, Percent, Plus, Trash2 } from "lucide-react";
import { entity } from "@/lib/entities";
import { mad } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { BASIS_LABEL, type CommissionRule } from "@/lib/types-ops";
import { deleteCommissionRule, saveCommissionRule } from "@/actions/planning";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Card, CardHeader, Empty, Field, Input, Kpi, Select, buttonClass, tableClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import type { CommissionLine, CommissionPerson } from "./lib";

/** Onglet Commissions : résultats du mois, règles, export */
export function CommissionsTab({
  visible,
  noResults,
  monthLabel,
  monthKey,
  persons,
  people,
  rules,
  team,
  entities,
  categories,
}: {
  /** Personnes affichées (après recherche / tri) ; par défaut toutes */
  visible?: CommissionPerson[];
  noResults?: React.ReactNode;
  monthLabel: string;
  monthKey: string;
  persons: CommissionPerson[];
  people: Map<string, Profile>;
  rules: CommissionRule[];
  team: Profile[];
  entities: { id: string; short: string }[];
  categories: string[];
}) {
  const total = persons.reduce((a, p) => a + p.total, 0);
  const caPrest = persons.reduce((a, p) => a + p.caPrest, 0);
  const caProd = persons.reduce((a, p) => a + p.caProd, 0);
  const name = (id: string) => people.get(id)?.full_name ?? "Membre supprimé";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        <Kpi label={`Commissions · ${monthLabel}`} value={mad(total)} icon={<Percent />} />
        <Kpi label="Prestations réalisées" value={mad(caPrest)} delta="Rendez-vous terminés" />
        <Kpi label="Produits vendus" value={mad(caProd)} delta="Ventes non remboursées" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <Card>
          <CardHeader
            title="Détail par personne"
            subtitle="Cliquez sur une ligne pour voir le détail par catégorie"
            action={
              persons.length ? (
                <a href={`/planning/export?mois=${monthKey}`} download className={buttonClass("secondary", "h-8")}>
                  <Download /> Export CSV
                </a>
              ) : undefined
            }
          />
          {noResults ? (
            <div className="border-t border-line">{noResults}</div>
          ) : persons.length ? (
            <div className="divide-y divide-line border-t border-line">
              {(visible ?? persons).map((p) => (
                <details key={p.profile_id} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-slate-50/70 [&::-webkit-details-marker]:hidden">
                    <Avatar name={name(p.profile_id)} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{name(p.profile_id)}</p>
                      <p className="truncate text-xs text-muted">
                        {p.caPrest > 0 && `Prestations ${mad(p.caPrest)}`}
                        {p.caPrest > 0 && p.caProd > 0 && " · "}
                        {p.caProd > 0 && `Produits ${mad(p.caProd)}`}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-ink">{mad(p.total)}</p>
                  </summary>
                  <div className="overflow-x-auto bg-slate-50/50 pb-2">
                    <table className={tableClass}>
                      <thead>
                        <tr>
                          <th>Catégorie</th>
                          <th className="text-right">Nb</th>
                          <th className="text-right">Montant</th>
                          <th className="text-right">Taux</th>
                          <th className="text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summarize(p.lines).map((g) => (
                          <tr key={g.key}>
                            <td>
                              <span className="font-medium text-ink">{g.category || "Sans catégorie"}</span>
                              <span className="ml-2 text-xs text-muted">
                                {g.basis === "prestations" ? "Prestations" : "Produits"} · {entity(g.entity_id)?.short}
                              </span>
                            </td>
                            <td className="text-right tabular-nums">{g.count}</td>
                            <td className="text-right tabular-nums">{mad(g.amount)}</td>
                            <td className="text-right tabular-nums text-muted">{g.rate ? `${g.rate} %` : "Aucune règle"}</td>
                            <td className="text-right font-semibold tabular-nums">{mad(g.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <Empty icon={<Percent />} title="Aucune activité commissionnable ce mois-ci" text="Les rendez-vous terminés avec un intervenant et les ventes de produits apparaissent ici." />
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Règles" subtitle="La règle la plus précise s'applique" />
            {rules.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {r.profile_id ? name(r.profile_id) : "Toute l'équipe"} · <span className="tabular-nums">{r.rate_pct} %</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <EntityBadge id={r.entity_id} />
                        <span>
                          {r.basis === "prestations" ? "Prestations" : "Produits"}
                          {r.category ? ` · ${r.category}` : ""}
                        </span>
                      </p>
                    </div>
                    <form action={deleteCommissionRule.bind(null, r.id)}>
                      <button type="submit" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Supprimer la règle" title="Supprimer">
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-line px-5 py-4 text-[13px] text-muted">Aucune règle : ajoutez-en une ci-dessous.</p>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink">Ajouter une règle</h3>
            <ActionForm action={saveCommissionRule} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <Field label="Établissement">
                  <Select name="entity_id" defaultValue={entities[0]?.id}>
                    {entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.short}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Taux (%)">
                  <Input name="rate_pct" inputMode="decimal" placeholder="10" required />
                </Field>
              </div>
              <Field label="Sur">
                <Select name="basis" defaultValue="prestations">
                  {(["prestations", "produits"] as const).map((b) => (
                    <option key={b} value={b}>
                      {BASIS_LABEL[b]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Membre">
                <Select name="profile_id" defaultValue="">
                  <option value="">Toute l&apos;équipe</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Catégorie (facultatif)" hint="Vide = toutes les catégories">
                <Input name="category" list="commission-categories" placeholder="Ex. Massage" />
                <datalist id="commission-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <SubmitButton variant="brand" className="w-full">
                <Plus /> Ajouter la règle
              </SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}

function summarize(lines: CommissionLine[]) {
  const map = new Map<string, { key: string; basis: CommissionLine["basis"]; entity_id: string; category: string; rate: number; count: number; amount: number; commission: number }>();
  for (const l of lines) {
    const key = `${l.basis}|${l.entity_id}|${l.category}|${l.rate}`;
    const g = map.get(key) ?? { key, basis: l.basis, entity_id: l.entity_id, category: l.category, rate: l.rate, count: 0, amount: 0, commission: 0 };
    g.count++;
    g.amount += l.amount;
    g.commission += l.commission;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.commission - a.commission || b.amount - a.amount);
}

