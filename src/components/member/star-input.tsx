"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const LABELS = ["", "Très déçu", "Déçu", "Correct", "Bien", "Excellent"];

/** Note de 1 à 5 étoiles (champ caché « rating ») */
export function StarInput({ name = "rating" }: { name?: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;
  return (
    <div>
      <input type="hidden" name={name} value={rating || ""} />
      <div className="flex gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Note">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={rating === i}
            aria-label={`${i} étoile${i > 1 ? "s" : ""}`}
            onClick={() => setRating(i)}
            onMouseEnter={() => setHover(i)}
            className="grid size-11 place-items-center rounded-lg transition active:scale-95"
          >
            <Star className={cn("size-7", i <= shown ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
          </button>
        ))}
      </div>
      <p className="mt-1 h-4 text-xs text-muted">{LABELS[shown]}</p>
    </div>
  );
}
