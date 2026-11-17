"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ENTITY_IDS } from "@/lib/entities";

/** Change l'établissement affiché (ou « tout le groupe » avec "all") */
export async function setScope(id: string) {
  const jar = await cookies();
  if (id === "all" || !ENTITY_IDS.includes(id as never)) jar.delete("scope");
  else jar.set("scope", id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
