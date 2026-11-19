"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { loadEstablishments } from "@/lib/establishments";

/** Change l'établissement affiché (ou « tout le groupe » avec "all") */
export async function setScope(id: string) {
  const jar = await cookies();
  const list = await loadEstablishments();
  if (id === "all" || !list.some((e) => e.id === id && e.active !== false)) jar.delete("scope");
  else jar.set("scope", id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
