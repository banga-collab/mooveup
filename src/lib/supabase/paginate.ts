/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Supabase renvoie au plus 1 000 lignes par requête (réglage « max rows » de l'API).
 * Avec des centaines de clients, ventes, RDV et entrées, une page qui lit « tout »
 * afficherait des totaux faux sans aucun message d'erreur.
 *
 * Ce correctif, appliqué une seule fois côté serveur, rend chaque lecture SANS limite
 * (`select()` sans `.limit()` / `.range()` / `.single()`) automatiquement complète :
 * les lignes sont chargées par pages de 1 000 puis rassemblées.
 * Les requêtes avec limite, les comptages (`head: true`), les écritures et les
 * lectures d'une seule ligne ne changent pas.
 */
import { PostgrestBuilder } from "@supabase/postgrest-js";

const PAGE = 1000;
const MAX_PAGES = 500; // 500 000 lignes au plus, garde-fou

let installed = false;

export function installAutoPagination() {
  if (installed) return;
  installed = true;
  const proto = PostgrestBuilder.prototype as any;
  const original = proto.then;

  proto.then = function (this: any, onfulfilled?: any, onrejected?: any) {
    const url: URL | undefined = this.url;
    const accept: string = this.headers?.get?.("Accept") ?? "";
    const eligible =
      !this.__paging &&
      this.method === "GET" &&
      url &&
      !url.searchParams.has("limit") &&
      !url.searchParams.has("offset") &&
      !accept.includes("vnd.pgrst.object");
    if (!eligible) return original.call(this, onfulfilled, onrejected);

    const run = async () => {
      this.__paging = true;
      const all: any[] = [];
      let first: any = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        url!.searchParams.set("offset", String(page * PAGE));
        url!.searchParams.set("limit", String(PAGE));
        const res: any = await new Promise((resolve, reject) => original.call(this, resolve, reject));
        if (!first) first = res;
        if (res.error || !Array.isArray(res.data)) return res; // erreur ou réponse inattendue : renvoyée telle quelle
        all.push(...res.data);
        if (res.data.length < PAGE) break;
      }
      return { ...first, data: all, count: first?.count ?? null };
    };
    return run().then(onfulfilled, onrejected);
  };
}

// Activé dès l'import (sauf démo) : couvre aussi les clients créés avec la clé service
if (process.env.NEXT_PUBLIC_DEMO !== "1") installAutoPagination();
