import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, lastMonths } from "@/lib/data";
import { entity } from "@/lib/entities";
import type { Profile } from "@/lib/types";
import { computeCommissions } from "@/components/planning/compute";
import { exportResponse, readFormat } from "@/lib/export/server";
import type { ExportColumn, ExportRow, ReportDoc } from "@/lib/export/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DETAIL: ExportColumn[] = [
  { key: "member", label: "Membre" },
  { key: "entity", label: "Établissement" },
  { key: "type", label: "Type" },
  { key: "date", label: "Date" },
  { key: "label", label: "Libellé" },
  { key: "category", label: "Catégorie" },
  { key: "amount", label: "Montant", kind: "money" },
  { key: "rate", label: "Taux", kind: "pct" },
  { key: "commission", label: "Commission", kind: "money" },
];
const TOTALS: ExportColumn[] = [
  { key: "member", label: "Membre" },
  { key: "caPrest", label: "Total prestations", kind: "money" },
  { key: "comPrest", label: "Commission prestations", kind: "money" },
  { key: "caProd", label: "Total produits", kind: "money" },
  { key: "comProd", label: "Commission produits", kind: "money" },
  { key: "total", label: "Commission totale", kind: "money" },
];

/** Export des commissions du mois avec l'en-tête Moov'Up. `?format=xlsx` (défaut) | `pdf` | `csv` */
export async function GET(req: Request) {
  await requireManager();
  const scope = await getScope();
  const asked = new URL(req.url).searchParams.get("mois") ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) ? asked : lastMonths(1)[0]!.key;
  const supabase = await createClient();
  const [{ persons }, { data: pr }] = await Promise.all([computeCommissions(scope, month), supabase.from("profiles").select("*")]);
  const people = byId(pr as Profile[]);
  const name = (id: string) => people.get(id)?.full_name ?? "";
  const monthText = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));

  const detail: ExportRow[] = persons.flatMap((p) =>
    p.lines.map((l) => ({
      member: name(p.profile_id),
      entity: entity(l.entity_id)?.short ?? l.entity_id,
      type: l.basis === "prestations" ? "Prestation" : "Produit",
      date: l.date,
      label: l.label,
      category: l.category,
      amount: l.amount,
      rate: l.rate,
      commission: l.commission,
    })),
  );
  const totals: ExportRow[] = persons.map((p) => ({ member: name(p.profile_id), caPrest: p.caPrest, comPrest: p.comPrest, caProd: p.caProd, comProd: p.comProd, total: p.total }));
  const sum = (k: "caPrest" | "comPrest" | "caProd" | "comProd" | "total") => persons.reduce((a, p) => a + p[k], 0);
  const grand: ExportRow = { member: "TOTAL", caPrest: sum("caPrest"), comPrest: sum("comPrest"), caProd: sum("caProd"), comProd: sum("comProd"), total: sum("total") };

  const doc: ReportDoc = {
    title: "Commissions",
    subtitle: monthText,
    fileName: `commissions-${month}`,
    filters: [{ label: "Mois", value: monthText }],
    count: detail.length,
    countLabel: detail.length > 1 ? "lignes de commission" : "ligne de commission",
    sections: [
      { title: "Total par membre", blocks: [{ type: "table", table: { columns: TOTALS, rows: totals, totals: grand }, empty: "Aucune commission ce mois-ci" }] },
      { title: "Détail des lignes", blocks: [{ type: "table", table: { columns: DETAIL, rows: detail }, empty: "Aucune ligne" }] },
    ],
    sheets: [
      { name: "Par membre", columns: TOTALS, rows: totals, totals: grand },
      { name: "Détail", columns: DETAIL, rows: detail },
    ],
  };
  return exportResponse(doc, readFormat(req, "xlsx"), req);
}
