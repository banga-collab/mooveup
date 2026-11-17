import type { Metadata } from "next";
import { entity } from "@/lib/entities";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import type { Review } from "@/lib/types-loyalty";
import { serviceClient } from "@/lib/automations";
import { ReviewForm } from "@/components/reviews/review-form";

export const metadata: Metadata = { title: "Votre avis", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Page publique d'avis : /r/<token> (lien envoyé par WhatsApp) */
export default async function PublicReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let review: Review | null = null;
  let settings: Settings = DEFAULT_SETTINGS;
  let firstName = "";
  if (/^[a-z0-9]{6,16}$/.test(token)) {
    try {
      const supabase = await serviceClient();
      const [{ data }, { data: s }] = await Promise.all([supabase.from("reviews").select("*").eq("token", token).maybeSingle(), supabase.from("settings").select("*").eq("id", 1).maybeSingle()]);
      review = data as Review | null;
      settings = { ...DEFAULT_SETTINGS, ...((s as Partial<Settings> | null) ?? {}) };
      if (review) {
        const { data: c } = await supabase.from("contacts").select("full_name").eq("id", review.contact_id).maybeSingle();
        firstName = ((c as { full_name: string } | null)?.full_name ?? "").split(" ")[0] ?? "";
      }
    } catch {
      review = null;
    }
  }
  const ent = entity(review?.entity_id);
  const name = ent?.name ?? "Moov'Up";
  const google = settings.google_review_url || `https://www.google.com/search?q=${encodeURIComponent(`${name} Agadir avis`)}`;

  return (
    <main className="flex min-h-dvh items-start justify-center bg-canvas px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Groupe Moov&apos;Up</p>
          <p className="mt-1 flex items-center justify-center gap-2 text-sm font-semibold text-ink">
            {ent && <span className="size-2 rounded-full" style={{ background: ent.color }} />}
            {name}
          </p>
        </div>
        {review ? (
          <>
            {!review.rating && (
              <div className="mb-6 text-center">
                <h1 className="text-xl font-semibold tracking-tight text-ink">{firstName ? `${firstName}, comment` : "Comment"} s&apos;est passée votre visite ?</h1>
                {review.service && <p className="mt-1 text-sm text-muted">{review.service}</p>}
              </div>
            )}
            <ReviewForm token={token} entityName={ent?.short ?? "l'établissement"} googleUrl={google} initial={review.rating ? { done: true, rating: review.rating } : undefined} />
          </>
        ) : (
          <div className="text-center">
            <p className="text-lg font-semibold text-ink">Lien expiré</p>
            <p className="mt-2 text-sm text-muted">Ce lien d&apos;avis n&apos;est plus valable. Merci de votre visite !</p>
          </div>
        )}
      </div>
    </main>
  );
}
