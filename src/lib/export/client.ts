import type { ExportFormat, ExportTableInput } from "./types";

/*
 * Côté navigateur : `exportTable({ title, columns, rows, filters, format })`.
 * Les fichiers sont construits par la route `/api/export` (en-tête Moov'Up, auteur et
 * heure d'Agadir fournis par le serveur, export tracé dans le journal).
 *  - xlsx / csv : téléchargement direct ;
 *  - pdf : nouvel onglet imprimable (impression automatique → « Enregistrer au format PDF »).
 * À appeler directement dans un gestionnaire de clic (sinon le bloqueur de fenêtres peut intervenir).
 */

export const EXPORT_ENDPOINT = "/api/export";

/** Envoie un formulaire POST vers un nouvel onglet */
export function postToNewTab(action: string, payload: unknown) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.target = "_blank";
  form.style.display = "none";
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "payload";
  input.value = JSON.stringify(payload);
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

/** Télécharge un Blob sous un nom donné */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function fileNameFrom(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1]!);
    } catch {
      /* nom brut */
    }
  }
  return disposition.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

/** Exporte un tableau (vue filtrée, colonnes visibles) avec l'en-tête Moov'Up */
export async function exportTable(input: ExportTableInput): Promise<void> {
  if (input.format === "pdf") {
    postToNewTab(EXPORT_ENDPOINT, input);
    return;
  }
  const res = await fetch(EXPORT_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) {
    let msg = "L'export n'a pas pu être généré.";
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* réponse non JSON */
    }
    throw new Error(msg);
  }
  saveBlob(await res.blob(), fileNameFrom(res.headers.get("Content-Disposition"), `export.${input.format}`));
}

/** Lien d'export d'une route serveur (ajoute `format=`) */
export function exportHref(href: string, format: ExportFormat) {
  const [p, q = ""] = href.split("?");
  const sp = new URLSearchParams(q);
  sp.set("format", format);
  return `${p}?${sp.toString()}`;
}
