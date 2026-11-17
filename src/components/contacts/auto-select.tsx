"use client";

import type { ComponentProps } from "react";
import { Select } from "@/components/ui";

/** Liste déroulante qui envoie son formulaire (GET) dès qu'on change la valeur */
export function AutoSelect(props: ComponentProps<"select">) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
