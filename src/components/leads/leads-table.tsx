"use client";

import type { ComponentProps } from "react";
import { ChevronRight, Trophy } from "lucide-react";
import { moveLead } from "@/actions/leads";
import type { LeadStage } from "@/lib/types";
import { DataTable } from "@/components/data-table/data-table";
import type { BulkAction } from "@/components/data-table/types";

/** Vue « Liste » des prospects : DataTable + changement d'étape groupé */
export function LeadsTable({ openIds, ...props }: Omit<ComponentProps<typeof DataTable>, "bulkActions"> & { openIds: string[] }) {
  const to = (stage: LeadStage, label: string, extra?: Partial<BulkAction>): BulkAction => ({
    label,
    icon: <ChevronRight />,
    ids: openIds,
    each: (id) => moveLead(id, stage),
    done: `{n} prospect(s) passé(s) à « ${label} »`,
    ...extra,
  });
  return (
    <DataTable
      {...props}
      bulkActions={[
        to("contacte", "Contacté"),
        to("essai", "Essai"),
        to("offre", "Offre"),
        to("gagne", "Gagné", { icon: <Trophy />, confirm: "Marquer {n} prospect(s) comme gagné(s) ? Ils deviennent clients.", done: "{n} prospect(s) gagné(s)" }),
      ]}
    />
  );
}
