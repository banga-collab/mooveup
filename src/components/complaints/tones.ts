import type { ComplaintPriority, ComplaintStatus } from "@/lib/types-business";

export const STATUS_TONE: Record<ComplaintStatus, "red" | "amber" | "green"> = { nouvelle: "red", en_cours: "amber", resolue: "green" };
export const PRIORITY_TONE: Record<ComplaintPriority, "red" | "gray" | "brand"> = { haute: "red", normale: "brand", basse: "gray" };
