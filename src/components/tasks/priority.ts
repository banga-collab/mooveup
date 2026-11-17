import type { TaskPriority } from "@/lib/types";

export const PRIORITY_META: Record<TaskPriority, { label: string; color: string; soft: string }> = {
  haute: { label: "Haute", color: "#dc2626", soft: "#fef2f2" },
  normale: { label: "Normale", color: "#1a6d8e", soft: "#eef6f9" },
  basse: { label: "Basse", color: "#64748b", soft: "#f1f5f9" },
};
