/* Archive ZIP minimale (fichiers « stockés », sans compression) — suffisante pour un .xlsx. */

let CRC_TABLE: Uint32Array | null = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (CRC_TABLE = t);
}

export function crc32(data: Uint8Array) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array | string };

/** Construit un fichier ZIP (méthode 0 = stocké) */
export function zip(entries: ZipEntry[], date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31);
  const dosDate = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);

  const files = entries.map((e) => {
    const data = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    return { name: enc.encode(e.name), data, crc: crc32(data) };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const f of files) {
    localSize += 30 + f.name.length + f.data.length;
    centralSize += 46 + f.name.length;
  }
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const offsets: number[] = [];

  for (const f of files) {
    offsets.push(p);
    view.setUint32(p, 0x04034b50, true);
    view.setUint16(p + 4, 20, true); // version
    view.setUint16(p + 6, 0x0800, true); // UTF-8
    view.setUint16(p + 8, 0, true); // stocké
    view.setUint16(p + 10, dosTime, true);
    view.setUint16(p + 12, dosDate, true);
    view.setUint32(p + 14, f.crc, true);
    view.setUint32(p + 18, f.data.length, true);
    view.setUint32(p + 22, f.data.length, true);
    view.setUint16(p + 26, f.name.length, true);
    view.setUint16(p + 28, 0, true);
    out.set(f.name, p + 30);
    out.set(f.data, p + 30 + f.name.length);
    p += 30 + f.name.length + f.data.length;
  }

  const central = p;
  files.forEach((f, i) => {
    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, 20, true);
    view.setUint16(p + 8, 0x0800, true);
    view.setUint16(p + 10, 0, true);
    view.setUint16(p + 12, dosTime, true);
    view.setUint16(p + 14, dosDate, true);
    view.setUint32(p + 16, f.crc, true);
    view.setUint32(p + 20, f.data.length, true);
    view.setUint32(p + 24, f.data.length, true);
    view.setUint16(p + 28, f.name.length, true);
    view.setUint16(p + 30, 0, true); // extra
    view.setUint16(p + 32, 0, true); // commentaire
    view.setUint16(p + 34, 0, true); // disque
    view.setUint16(p + 36, 0, true); // attributs internes
    view.setUint32(p + 38, 0, true); // attributs externes
    view.setUint32(p + 42, offsets[i]!, true);
    out.set(f.name, p + 46);
    p += 46 + f.name.length;
  });

  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 4, 0, true);
  view.setUint16(p + 6, 0, true);
  view.setUint16(p + 8, files.length, true);
  view.setUint16(p + 10, files.length, true);
  view.setUint32(p + 12, p - central, true);
  view.setUint32(p + 16, central, true);
  view.setUint16(p + 20, 0, true);
  return out;
}
