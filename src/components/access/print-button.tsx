"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

export function PrintButton({ label = "Imprimer", variant = "brand" }: { label?: string; variant?: "brand" | "secondary" }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass(variant)}>
      <Printer /> {label}
    </button>
  );
}
