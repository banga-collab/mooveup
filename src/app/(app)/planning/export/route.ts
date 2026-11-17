import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, lastMonths } from "@/lib/data";
import { entity } from "@/lib/entities";
import type { Profile } from "@/lib/types";
import { computeCommissions } from "@/components/planning/compute";

/** Export CSV des commissions du mois (séparateur « ; » pour Excel en français) */
export async function GET(req: Request) {
  await requireManager();
  const scope = await getScope();
  const asked = new URL(req.url).searchParams.get("mois") ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) ? asked : lastMonths(1)[0]!.key;
  const supabase = await createClient();
  const [{ persons }, { data: pr }] = await Promise.all([computeCommissions(scope, month), supabase.from("profiles").select("*")]);
  const people = byId(pr as Profile[]);

  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const dec = (n: number) => n.toFixed(2).replace(".", ",");
  const csv = [
    ["Membre", "Établissement", "Type", "Date", "Libellé", "Catégorie", "Montant (MAD)", "Taux (%)", "Commission (MAD)"].map(cell).join(";"),
    ...persons.flatMap((p) =>
      p.lines.map((l) =>
        [people.get(p.profile_id)?.full_name ?? "", entity(l.entity_id)?.short ?? l.entity_id, l.basis === "prestations" ? "Prestation" : "Produit", l.date, l.label, l.category, dec(l.amount), String(l.rate).replace(".", ","), dec(l.commission)]
          .map(cell)
          .join(";"),
      ),
    ),
    "",
    ["Membre", "Total prestations", "Commission prestations", "Total produits", "Commission produits", "Commission totale"].map(cell).join(";"),
    ...persons.map((p) => [people.get(p.profile_id)?.full_name ?? "", dec(p.caPrest), dec(p.comPrest), dec(p.caProd), dec(p.comProd), dec(p.total)].map(cell).join(";")),
  ].join("\r\n");

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commissions-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
