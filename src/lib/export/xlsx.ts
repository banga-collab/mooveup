import { escXml, kindOf, parseLooseNumber } from "./format";
import type { ExportColumn, ExportKind, ExportSheet, ExportValue } from "./types";
import { zip, type ZipEntry } from "./zip";

/*
 * Classeur Excel (.xlsx) sans dépendance : SpreadsheetML + ZIP stocké.
 * Chaque feuille reçoit l'en-tête Moov'Up (logo, titre, périmètre, filtres, auteur, date),
 * une ligne de titres figée avec filtre automatique, des nombres réels (montants au format MAD)
 * et un pied de page avec pagination à l'impression.
 */

export type HeaderLine = { text: string; style: "group" | "title" | "meta" | "section" };
export type XlsxLogo = { data: Uint8Array; width: number; height: number };

const S = {
  default: 0,
  group: 1,
  title: 2,
  meta: 3,
  head: 4,
  headNum: 5,
  money: 6,
  int: 7,
  dec: 8,
  pct: 9,
  totText: 10,
  totMoney: 11,
  totInt: 12,
  totDec: 13,
  totPct: 14,
  section: 15,
} as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0\\ &quot;MAD&quot;"/><numFmt numFmtId="165" formatCode="0.0\\ &quot;%&quot;"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts>
<fonts count="6">
<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FF1A6D8E"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="12"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF1A6D8E"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF94A3B8"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="16">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="166" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function colName(i: number) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Nom de feuille valide et unique (31 caractères, sans []:*?/\) */
function sheetNames(names: string[]) {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = (raw.replace(/[[\]:*?/\\']/g, " ").replace(/\s+/g, " ").trim() || "Feuille").slice(0, 31);
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

function strCell(ref: string, s: string, style = 0) {
  const pre = /^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t${pre}>${escXml(s)}</t></is></c>`;
}
function numCell(ref: string, n: number, style = 0) {
  return `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${Number.isInteger(n) ? n : Math.round(n * 10000) / 10000}</v></c>`;
}

/** Cellule de données selon le format de colonne */
function dataCell(ref: string, v: ExportValue, kind: ExportKind, total: boolean): string {
  if (v === null || v === undefined || v === "") return total ? `<c r="${ref}" s="${S.totText}"/>` : "";
  if (typeof v === "boolean") return strCell(ref, v ? "Oui" : "Non", total ? S.totText : 0);
  let n: number | null = null;
  let k: ExportKind = kind;
  if (typeof v === "number") n = Number.isFinite(v) ? v : null;
  else if (kind !== "text") {
    const p = parseLooseNumber(v);
    if (p) {
      n = p.n;
      if (p.money) k = "money";
      else if (p.pct) k = "pct";
    }
  }
  if (n === null) return strCell(ref, String(v), total ? S.totText : 0);
  if (k === "text" || k === "num") k = Number.isInteger(n) ? "int" : "num";
  const style = total
    ? k === "money"
      ? S.totMoney
      : k === "pct"
        ? S.totPct
        : k === "int"
          ? S.totInt
          : S.totDec
    : k === "money"
      ? S.money
      : k === "pct"
        ? S.pct
        : k === "int"
          ? S.int
          : S.dec;
  return numCell(ref, n, style);
}

function textLen(v: ExportValue, kind: ExportKind) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return (kind === "money" ? 4 : 0) + String(Math.round(v)).length * 1.3;
  return Math.min(80, String(v).split("\n").reduce((a, l) => Math.max(a, l.length), 0));
}

function widths(cols: ExportColumn[], sheet: ExportSheet) {
  return cols.map((c) => {
    if (c.width) return c.width;
    const k = kindOf(c);
    let w = c.label.length + 2;
    const sample = sheet.rows.length > 800 ? sheet.rows.slice(0, 800) : sheet.rows;
    for (const r of sample) w = Math.max(w, textLen(r[c.key], k) + 2);
    if (sheet.totals) w = Math.max(w, textLen(sheet.totals[c.key], k) + 2);
    return Math.max(8, Math.min(60, Math.ceil(w)));
  });
}

function sheetXml(sheet: ExportSheet, header: HeaderLine[], hasLogo: boolean, footer: string, first: boolean) {
  const cols = sheet.columns;
  const rows: string[] = [];
  let r = 1;
  if (hasLogo) rows.push(`<row r="${r++}" ht="36" customHeight="1"/>`);
  for (const h of header) {
    const st = h.style === "group" ? S.group : h.style === "title" ? S.title : h.style === "section" ? S.section : S.meta;
    rows.push(`<row r="${r}"${h.style === "group" ? ' ht="20" customHeight="1"' : ""}>${strCell(`A${r}`, h.text, st)}</row>`);
    r++;
  }
  if (sheet.title) {
    rows.push(`<row r="${r}">${strCell(`A${r}`, sheet.title, S.section)}</row>`);
    r++;
  }
  r++; // ligne vide
  const headRow = r;
  rows.push(`<row r="${r}" ht="20" customHeight="1">${cols.map((c, i) => strCell(`${colName(i)}${r}`, c.label, kindOf(c) === "text" ? S.head : S.headNum)).join("")}</row>`);
  r++;
  const kinds = cols.map(kindOf);
  for (const row of sheet.rows) {
    rows.push(`<row r="${r}">${cols.map((c, i) => dataCell(`${colName(i)}${r}`, row[c.key], kinds[i]!, false)).join("")}</row>`);
    r++;
  }
  const lastData = r - 1;
  if (sheet.totals) {
    rows.push(`<row r="${r}">${cols.map((c, i) => dataCell(`${colName(i)}${r}`, sheet.totals![c.key], kinds[i]!, true)).join("")}</row>`);
    r++;
  }
  const lastCol = colName(Math.max(0, cols.length - 1));
  const w = widths(cols, sheet);
  const landscape = cols.length > 6;
  return {
    headRow,
    lastData,
    lastCol,
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${lastCol}${Math.max(r - 1, 1)}"/>
<sheetViews><sheetView workbookViewId="0"${first ? ' tabSelected="1"' : ""}><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headRow + 1}" sqref="A${headRow + 1}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols.length ? `<cols>${w.map((x, i) => `<col min="${i + 1}" max="${i + 1}" width="${x}" customWidth="1"/>`).join("")}</cols>` : ""}
<sheetData>${rows.join("")}</sheetData>
${sheet.rows.length && cols.length ? `<autoFilter ref="A${headRow}:${lastCol}${lastData}"/>` : ""}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>
<headerFooter><oddFooter>${escXml(`&L&8${footer.replace(/&/g, "&&")}&R&8Page &P / &N`)}</oddFooter></headerFooter>
${hasLogo ? '<drawing r:id="rId1"/>' : ""}
</worksheet>`,
  };
}

function drawingXml(logo: XlsxLogo) {
  const h = 40;
  const w = Math.round((logo.width / logo.height) * h);
  const emu = (px: number) => px * 9525;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${emu(4)}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${emu(4)}</xdr:rowOff></xdr:from><xdr:ext cx="${emu(w)}" cy="${emu(h)}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo Moov'Up"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>
<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
}

/** Dimensions d'une image PNG (en-tête IHDR) */
export function pngSize(data: Uint8Array): { width: number; height: number } | null {
  if (data.length < 24 || data[0] !== 0x89 || data[1] !== 0x50) return null;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

/** Construit le classeur */
export function buildXlsx({ sheets, header, logo, footer, title, author }: { sheets: ExportSheet[]; header: HeaderLine[]; logo?: XlsxLogo | null; footer: string; title: string; author: string }): Uint8Array {
  const list = sheets.length ? sheets : [{ name: "Export", columns: [], rows: [] }];
  const names = sheetNames(list.map((s) => s.name));
  const files: ZipEntry[] = [];
  const definedNames: string[] = [];
  const hasLogo = !!logo;

  list.forEach((s, i) => {
    const { xml, headRow, lastData, lastCol } = sheetXml(s, header, hasLogo, footer, i === 0);
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml });
    const q = `'${names[i]!.replace(/'/g, "''")}'`;
    if (s.rows.length && s.columns.length) definedNames.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escXml(`${q}!$A$${headRow}:$${lastCol}$${lastData}`)}</definedName>`);
    definedNames.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${escXml(`${q}!$${headRow}:$${headRow}`)}</definedName>`);
    if (hasLogo) {
      files.push({
        name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i + 1}.xml"/></Relationships>`,
      });
      files.push({ name: `xl/drawings/drawing${i + 1}.xml`, data: drawingXml(logo!) });
      files.push({
        name: `xl/drawings/_rels/drawing${i + 1}.xml.rels`,
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>`,
      });
    }
  });
  if (hasLogo) files.push({ name: "xl/media/logo.png", data: logo!.data });

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const head: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${hasLogo ? '<Default Extension="png" ContentType="image/png"/>' : ""}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
${hasLogo ? list.map((_, i) => `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("") : ""}
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escXml(title)}</dc:title><dc:creator>${escXml(author)}</dc:creator><cp:lastModifiedBy>${escXml(author)}</cp:lastModifiedBy><dc:publisher>Groupe Moov'Up</dc:publisher><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${names.map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
${definedNames.length ? `<definedNames>${definedNames.join("")}</definedNames>` : ""}
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: STYLES },
  ];
  return zip([...head, ...files]);
}
