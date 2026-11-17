/** Lecture de fichiers CSV exportés d'Excel (séparateur ; ou , — UTF-8 ou Windows-1252) */

export type ImportField = "full_name" | "first_name" | "phone" | "email" | "sex" | "birth_date" | "city" | "tags" | "notes";

export const FIELDS: { id: ImportField; label: string; hint?: string; required?: boolean }[] = [
  { id: "full_name", label: "Nom", hint: "Nom complet, ou nom de famille si le prénom est dans une autre colonne", required: true },
  { id: "first_name", label: "Prénom", hint: "Seulement si le prénom est dans une colonne séparée" },
  { id: "phone", label: "Téléphone", hint: "Sert à détecter les doublons" },
  { id: "email", label: "E-mail" },
  { id: "sex", label: "Sexe", hint: "H / F, Homme / Femme, M. / Mme" },
  { id: "birth_date", label: "Date de naissance", hint: "JJ/MM/AAAA ou AAAA-MM-JJ" },
  { id: "city", label: "Ville" },
  { id: "tags", label: "Tags", hint: "Séparés par des virgules" },
  { id: "notes", label: "Notes" },
];

const SYNONYMS: Record<ImportField, string[]> = {
  full_name: ["nom complet", "nom et prenom", "prenom et nom", "nom prenom", "prenom nom", "client", "adherent", "full name", "name", "nom"],
  first_name: ["prenom", "first name", "firstname"],
  phone: ["telephone", "tel", "portable", "mobile", "gsm", "phone", "whatsapp", "numero", "num tel"],
  email: ["e mail", "email", "mail", "courriel"],
  sex: ["sexe", "genre", "civilite", "sex", "gender"],
  birth_date: ["date de naissance", "naissance", "ne le", "nee le", "ddn", "birthday", "birth date", "date naissance", "anniversaire"],
  city: ["ville", "city", "localite", "quartier"],
  tags: ["tags", "tag", "etiquettes", "etiquette", "categorie", "groupe", "segment"],
  notes: ["notes", "note", "remarque", "remarques", "commentaire", "commentaires", "observations", "observation"],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Devine la colonne de chaque champ à partir des en-têtes */
export function guessMapping(headers: string[]): Record<ImportField, number | null> {
  const out = Object.fromEntries(FIELDS.map((f) => [f.id, null])) as Record<ImportField, number | null>;
  const used = new Set<number>();
  const H = headers.map(norm);
  // Correspondance exacte d'abord, puis « contient »
  // Le prénom avant le nom : « nom » est contenu dans « prénom »
  const order = [...FIELDS].sort((a, b) => Number(b.id === "first_name") - Number(a.id === "first_name"));
  for (const pass of ["exact", "contains"] as const) {
    for (const f of order) {
      if (out[f.id] !== null) continue;
      for (const syn of SYNONYMS[f.id]) {
        const i = H.findIndex((h, idx) => !used.has(idx) && (pass === "exact" ? h === syn : h.includes(syn)));
        if (i >= 0) {
          out[f.id] = i;
          used.add(i);
          break;
        }
      }
    }
  }
  return out;
}

/** Décode le fichier : UTF-8 si valide, sinon Windows-1252 (Excel français) */
export function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/** Séparateur le plus probable sur les premières lignes */
function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const count = (c: string) => sample.split(c).length - 1;
  const candidates = [";", ",", "\t"].map((c) => [c, count(c)] as const).sort((a, b) => b[1] - a[1]);
  return candidates[0]![1] > 0 ? candidates[0]![0] : ";";
}

/** Analyse CSV (guillemets, retours à la ligne dans les cellules, "" échappés) */
export function parseCsv(text: string): { headers: string[]; rows: string[][]; delimiter: string } {
  const d = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === d) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const clean = rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
  const [headers = [], ...data] = clean;
  return { headers, rows: data, delimiter: d === "\t" ? "tabulation" : d };
}

/** Modèle à télécharger (UTF-8 avec BOM pour Excel, séparateur ;) */
export function templateCsv() {
  const lines = [
    ["Nom", "Téléphone", "E-mail", "Sexe", "Date de naissance", "Ville", "Tags", "Notes"],
    ["Salma Bennani", "06 12 34 56 78", "salma.bennani@gmail.com", "F", "14/03/1992", "Agadir", "VIP", "Préfère WhatsApp"],
    ["Youssef El Amrani", "0661223344", "", "H", "1988-07-02", "Inezgane", "Parrain, Entreprise partenaire", ""],
  ];
  return "﻿" + lines.map((l) => l.map((v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(";")).join("\r\n");
}
