/**
 * Traduction de l'interface : français (par défaut) ou arabe (de droite à gauche).
 * La langue est choisie par chaque membre (cookie « lang »).
 * Serveur : const lang = await getLang(); t(lang, "nav.caisse")
 * Navigateur : const t = useT() (voir ./client.tsx)
 */
import { cookies } from "next/headers";
import type { Lang } from "./core";

export { DICTS, t, dir, type Lang, type Dict } from "./core";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get("lang")?.value;
  return v === "ar" ? "ar" : "fr";
}
