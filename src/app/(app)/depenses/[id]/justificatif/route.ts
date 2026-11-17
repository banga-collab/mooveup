import { NextResponse } from "next/server";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Expense } from "@/lib/types-finance";

/** Affiche le justificatif d'une dépense (data URL en démo, lien Storage sinon) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getProfile();
  if (me.role !== "direction" && me.role !== "manager") return new NextResponse("Accès refusé", { status: 403 });
  const scope = await getScope();
  const supabase = await createClient();
  const { data } = await supabase.from("expenses").select("*").eq("id", id).maybeSingle();
  const exp = data as Expense | null;
  if (!exp?.receipt_url || !scope.allowed.some((e) => e.id === exp.entity_id)) return new NextResponse("Justificatif introuvable", { status: 404 });

  const m = exp.receipt_url.match(/^data:([^;]+);base64,(.+)$/);
  if (m) {
    return new NextResponse(Buffer.from(m[2]!, "base64"), { headers: { "Content-Type": m[1]!, "Cache-Control": "private, max-age=3600" } });
  }
  if (/^https:\/\//.test(exp.receipt_url)) return NextResponse.redirect(exp.receipt_url);
  return new NextResponse("Justificatif introuvable", { status: 404 });
}
