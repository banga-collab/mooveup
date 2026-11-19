/* Module serveur uniquement (actions et routes) */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO } from "@/lib/demo";
import type { Attachment } from "@/lib/types-business";

/**
 * Enregistre une image déjà compressée par `ImageInput` :
 * data URL en démo, bucket « business » de Supabase Storage sinon.
 */
export async function storeImage(supabase: SupabaseClient, file: FormDataEntryValue | null, folder: string): Promise<string | null> {
  if (!(file instanceof File) || !file.size || !file.type.startsWith("image/")) return null;
  if (file.size > 8 * 1024 * 1024) return null;
  if (DEMO) return `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
  const path = `${folder}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("business").upload(path, file, { contentType: file.type });
  if (error) return null;
  return supabase.storage.from("business").getPublicUrl(path).data.publicUrl;
}

/** Plusieurs images d'un même champ (`multiple`) → pièces jointes */
export async function storeImages(supabase: SupabaseClient, files: FormDataEntryValue[], folder: string, max = 12): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const f of files.slice(0, max)) {
    const url = await storeImage(supabase, f, folder);
    if (url) out.push({ url, label: f instanceof File ? f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80) : null, added_at: new Date().toISOString() });
  }
  return out;
}

/** Réponse HTTP d'une image stockée (data URL base64 / SVG, ou lien https) */
export function serveImage(url: string | null | undefined) {
  if (!url) return new NextResponse("Image introuvable", { status: 404 });
  const b64 = url.match(/^data:([^;,]+);base64,(.+)$/);
  if (b64) return new NextResponse(Buffer.from(b64[2]!, "base64"), { headers: { "Content-Type": b64[1]!, "Cache-Control": "private, max-age=86400" } });
  const raw = url.match(/^data:([^;,]+)(?:;charset=[^,]+)?,(.+)$/);
  if (raw) return new NextResponse(decodeURIComponent(raw[2]!), { headers: { "Content-Type": raw[1]!, "Cache-Control": "private, max-age=86400" } });
  if (/^https:\/\//.test(url)) return NextResponse.redirect(url);
  return new NextResponse("Image introuvable", { status: 404 });
}
