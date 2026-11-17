import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Adresse affichable d'une photo de soin : data URL (démo) ou lien http tels quels,
 * sinon lien signé temporaire vers le bucket privé « care-photos ».
 */
export async function photoSources(supabase: SupabaseClient, urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const paths: string[] = [];
  for (const u of urls) {
    if (u.startsWith("data:") || u.startsWith("http")) out.set(u, u);
    else paths.push(u);
  }
  if (paths.length) {
    const { data } = await supabase.storage.from("care-photos").createSignedUrls(paths, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  }
  return out;
}
