import { NextResponse } from "next/server";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Partnership } from "@/lib/types-business";
import { serveImage } from "@/components/complaints/store-image";

/** Photo d'une collaboration */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const me = await getProfile();
  if (me.role !== "direction" && me.role !== "manager") return new NextResponse("Accès refusé", { status: 403 });
  const scope = await getScope();
  const supabase = await createClient();
  const { data } = await supabase.from("partnerships").select("*").eq("id", id).maybeSingle();
  const p = data as Partnership | null;
  if (!p || ((p.entity_ids ?? []).length && !p.entity_ids.some((e) => scope.allowed.some((a) => a.id === e)))) return new NextResponse("Introuvable", { status: 404 });
  return serveImage(p.photos?.[Number(n)]?.url);
}
