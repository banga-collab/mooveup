"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitReview, type ReviewFormState } from "@/actions/reviews";

const LABELS = ["", "Très déçu", "Déçu", "Correct", "Bien", "Excellent"];

function Send({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-[15px] font-medium text-white transition hover:bg-brand-600 disabled:opacity-40">
      {pending && <Loader2 className="size-4 animate-spin" />} Envoyer mon avis
    </button>
  );
}

/** Formulaire public d'avis (page /r/<token>) */
export function ReviewForm({ token, entityName, googleUrl, initial }: { token: string; entityName: string; googleUrl: string; initial: ReviewFormState }) {
  const [state, action] = useActionState(submitReview, initial);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

  if (state?.done) {
    const good = (state.rating ?? 0) >= 4;
    return (
      <div className="text-center">
        <p className="text-lg font-semibold text-ink">Merci pour votre avis !</p>
        {good ? (
          <>
            <p className="mt-2 text-[15px] text-slate-600">Ravis que votre visite vous ait plu. Pourriez-vous le dire aussi sur Google ? Cela nous aide beaucoup.</p>
            <a href={googleUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-500 text-[15px] font-medium text-white hover:bg-brand-600">
              Laisser un avis Google
            </a>
          </>
        ) : (
          <p className="mt-2 text-[15px] text-slate-600">Nous sommes désolés que votre expérience n&apos;ait pas été à la hauteur. Le responsable de {entityName} va vous recontacter rapidement.</p>
        )}
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={rating || ""} />
      <div>
        <div className="flex justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i} étoile${i > 1 ? "s" : ""}`}
              aria-pressed={rating === i}
              onClick={() => setRating(i)}
              onMouseEnter={() => setHover(i)}
              className="grid size-12 place-items-center rounded-lg transition active:scale-95"
            >
              <Star className={cn("size-9 transition", i <= shown ? "fill-amber-400 text-amber-400" : "fill-slate-100 text-slate-300")} strokeWidth={1.5} />
            </button>
          ))}
        </div>
        <p className="mt-2 h-5 text-center text-sm text-muted">{LABELS[shown]}</p>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Un commentaire ? (facultatif)</span>
        <textarea
          name="comment"
          rows={3}
          maxLength={1000}
          placeholder={rating && rating <= 3 ? "Dites-nous ce qui n'allait pas, nous allons corriger." : "Ce que vous avez aimé…"}
          className="w-full resize-none rounded-xl border border-line bg-white px-3.5 py-3 text-[15px] placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
        />
      </label>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <Send disabled={!rating} />
    </form>
  );
}
