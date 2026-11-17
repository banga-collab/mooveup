import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import { memberReadDb, requireMember } from "@/lib/member-auth";
import { ENTITIES, ENTITY_IDS, entity } from "@/lib/entities";
import { cn } from "@/lib/utils";
import type { Review } from "@/lib/types-loyalty";
import { submitMemberReview } from "@/actions/member";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { EntityBadge } from "@/components/entity-icon";
import { Field, Select, Textarea } from "@/components/ui";
import { StarInput } from "@/components/member/star-input";
import { MCard, MTitle, getMt } from "@/components/member/parts";
import { mDate } from "@/components/member/i18n";

export const metadata = { title: "Mes avis" };
export const dynamic = "force-dynamic";

export default async function MemberReviewsPage() {
  const [{ contact }, { lang, t }] = await Promise.all([requireMember(), getMt()]);
  const db = await memberReadDb();
  const { data } = await db.from("reviews").select("*").eq("contact_id", contact.id).order("created_at", { ascending: false });
  const reviews = (data ?? []) as Review[];
  const pending = reviews.filter((r) => !r.rating).slice(0, 5);
  const given = reviews.filter((r) => r.rating);
  const mine = contact.entity_ids.length ? contact.entity_ids : ENTITY_IDS;
  const options = ENTITIES.filter((e) => mine.includes(e.id));

  return (
    <div className="space-y-4">
      <MTitle title={t("m.review.title")} />

      {pending.length > 0 && (
        <MCard title={t("m.review.pending")}>
          <ul className="divide-y divide-line">
            {pending.map((r) => (
              <li key={r.id}>
                <Link href={`/r/${r.token}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{r.service ?? entity(r.entity_id)?.short}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <EntityBadge id={r.entity_id} />
                      {mDate(lang, r.created_at, { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <span className="text-[13px] font-medium text-brand-600">{t("m.review.give")}</span>
                  <ChevronRight className="size-4 text-slate-300 rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </MCard>
      )}

      <MCard title={t("m.review.new")}>
        <ActionForm action={submitMemberReview} className="space-y-4 px-4 pb-4 pt-2">
          <Field label={t("m.review.where")}>
            <Select name="entity_id" defaultValue={options[0]?.id} required>
              {options.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <StarInput />
          <Field label={t("m.review.comment")}>
            <Textarea name="comment" maxLength={1000} rows={3} />
          </Field>
          <SubmitButton variant="brand" className="h-11 w-full text-sm" pendingText="…">
            {t("m.review.send")}
          </SubmitButton>
        </ActionForm>
      </MCard>

      <MCard title={t("m.review.history")}>
        {given.length ? (
          <ul className="divide-y divide-line">
            {given.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <EntityBadge id={r.entity_id} />
                  <span className="flex gap-0.5" aria-label={`${r.rating}/5`}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className={cn("size-3.5", i <= (r.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                    ))}
                  </span>
                </div>
                {r.comment && <p className="mt-1.5 text-[13px] text-slate-600">« {r.comment} »</p>}
                <p className="mt-1 text-xs text-muted">{mDate(lang, r.answered_at ?? r.created_at, { day: "numeric", month: "short", year: "numeric" })}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-4 pt-1 text-[13px] text-muted">{t("m.review.none")}</p>
        )}
      </MCard>
    </div>
  );
}
