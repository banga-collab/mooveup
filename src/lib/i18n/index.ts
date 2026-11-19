/**
 * Traduction de l'interface : français (par défaut), arabe (de droite à gauche) ou anglais.
 * La langue est choisie par chaque membre (cookie « lang »).
 * Serveur : const lang = await getLang(); t(lang, "nav.caisse")
 * Navigateur : const t = useT() (voir ./client.tsx)
 */
import { cookies } from "next/headers";
import { parseLang, type Lang } from "./core";

export { DICTS, LANGS, t, dir, locale, parseLang, type Lang, type Dict } from "./core";

export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get("lang")?.value);
}
