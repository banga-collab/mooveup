import { NextResponse } from "next/server";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Complaint } from "@/lib/types-business";
import { serveImage } from "@/components/complaints/store-image";

/** Photo jointe à une réclamation */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getScope();
  const supabase = await createClient();
  const { data } = await supabase.from("complaints").select("*").eq("id", id).maybeSingle();
  const c = data as Complaint | null;
  if (!c || !scope.allowed.some((e) => e.id === c.entity_id)) return new NextResponse("Introuvable", { status: 404 });
  return serveImage(c.photo_url);
}
