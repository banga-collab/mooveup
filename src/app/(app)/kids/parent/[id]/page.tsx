import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Minus, Phone } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";
import { age, cn, fmtDate, waLink } from "@/lib/utils";
import { attendanceRate, daysLabel } from "@/lib/types-care";
import { loadKids, mainParent, phoneKey } from "@/components/kids/kids-data";
import { WhatsAppIcon } from "@/components/contacts/bits";
import { BackLink } from "@/components/back-link";
import { ContactLink } from "@/components/quick-view/contact-link";
import { Avatar, Badge, buttonClass, Card, CardHeader, PageHeader } from "@/components/ui";

export const metadata = { title: "Fiche famille" };

export default async function KidsParentPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  if (!scope.allowed.some((e) => e.id === "kids")) notFound();
  const supabase = await createClient();
  const data = await loadKids(supabase);
  const first = data.contactById.get(id);
  if (!first) notFound();

  const firstChild = data.childByContact.get(id);
  const parent = mainParent(first, firstChild);
  const key = phoneKey(parent.phone);
  const kids = key
    ? data.contacts.filter((c) => {
        const ch = data.childByContact.get(c.id);
        return phoneKey(mainParent(c, ch).phone) === key || (ch?.parent2_phone && phoneKey(ch.parent2_phone) === key);
      })
    : [first];
  if (!kids.some((k) => k.id === first.id)) kids.unshift(first);

  const wa = waLink(parent.phone, `Bonjour ${parent.name.split(" ")[0]}, ici l'équipe Moov'Up Kids.`);
  const second = firstChild?.parent2_name ? { name: firstChild.parent2_name, phone: firstChild.parent2_phone, relation: firstChild.parent2_relation } : null;

  const perm = (ok: boolean | undefined, label: string) => (
    <span className={cn("inline-flex items-center gap-1 text-[13px]", ok ? "text-emerald-700" : "text-red-600")}>
      {ok ? <Check className="size-3.5" /> : <Minus className="size-3.5" />} {label}
    </span>
  );

  return (
    <div>
      <BackLink href="/kids?v=familles" label="Familles" />
      <PageHeader
        title={parent.name}
        subtitle={`${firstChild?.parent1_relation ?? "Parent"} de ${kids.map((k) => k.full_name.split(" ")[0]).join(", ")}`}
        actions={
          <>
            {parent.phone && (
              <a href={`tel:${parent.phone.replace(/\s/g, "")}`} className={buttonClass("secondary")}>
                <Phone /> {parent.phone}
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("brand")}>
                <WhatsAppIcon className="size-4" /> WhatsApp
              </a>
            )}
          </>
        }
      />

      {second && (
        <Card className="mb-6 flex flex-wrap items-center gap-3 px-5 py-3.5">
          <span className="text-[13px] text-muted">Second contact</span>
          <span className="text-sm font-medium text-ink">
            {second.name}
            {second.relation && <span className="font-normal text-muted"> · {second.relation}</span>}
          </span>
          {second.phone && (
            <a href={`tel:${second.phone.replace(/\s/g, "")}`} className="text-[13px] tabular-nums text-brand-600 hover:underline">
              {second.phone}
            </a>
          )}
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
        {kids.map((k: Contact) => {
          const ch = data.childByContact.get(k.id);
          const mem = data.members.filter((m) => m.contact_id === k.id);
          const att = data.attendance.filter((a) => a.contact_id === k.id);
          const rate = attendanceRate(att);
          const absences = att.filter((a) => a.status === "absent").sort((a, b) => b.date.localeCompare(a.date));
          return (
            <Card key={k.id}>
              <div className="flex items-center gap-3 px-5 pb-3 pt-4">
                <Avatar name={k.full_name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <ContactLink id={k.id} name={k.full_name} className="font-semibold" />
                  </p>
                  <p className="text-xs text-muted">
                    {age(k.birth_date) !== null ? `${age(k.birth_date)} ans` : "Âge non renseigné"}
                    {k.birth_date && ` · né(e) le ${fmtDate(k.birth_date, { day: "numeric", month: "long" })}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums text-ink">{rate === null ? "–" : `${rate} %`}</p>
                  <p className="text-[11px] text-muted">présence 4 sem.</p>
                </div>
              </div>
              <div className="space-y-3 border-t border-line px-5 py-4">
                {mem.length ? (
                  <ul className="space-y-1.5">
                    {mem.map((m) => {
                      const g = data.groups.find((x) => x.id === m.group_id);
                      if (!g) return null;
                      return (
                        <li key={m.id} className="flex items-center justify-between gap-2 text-[13px]">
                          <Link href={`/kids/groupes/${g.id}`} className="min-w-0 truncate font-medium text-ink hover:text-brand-600">
                            {g.name}
                          </Link>
                          {m.status === "attente" ? (
                            <Badge tone="amber">Liste d&apos;attente</Badge>
                          ) : (
                            <span className="shrink-0 text-muted">
                              {daysLabel(g.days)} · {g.start_time}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">Inscrit(e) dans aucun groupe.</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {perm(ch?.allow_leave_alone, "Sortie seul(e)")}
                  {perm(ch?.allow_photos, "Photos")}
                  {perm(ch?.allow_medical ?? true, "Urgence médicale")}
                </div>
                {ch?.pickup_names && <p className="text-[13px] text-slate-600">Peut être récupéré(e) par : {ch.pickup_names}</p>}
                {ch?.health_notes && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{ch.health_notes}</p>}
                {absences.length > 0 && (
                  <p className="text-[13px] text-muted">
                    Absences récentes : {absences.slice(0, 4).map((a) => fmtDate(a.date, { day: "numeric", month: "short" })).join(", ")}
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {!firstChild && (
        <Card className="mt-6">
          <CardHeader title="Fiche parents à compléter" subtitle="Ajoutez le second contact et les autorisations depuis l'onglet Dossier de l'enfant." action={<Link href={`/contacts/${first.id}?tab=dossier`}>Compléter</Link>} />
        </Card>
      )}
    </div>
  );
}
