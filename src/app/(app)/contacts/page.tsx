import Link from "next/link";
import { ChevronRight, Phone, Search, Sparkles, Tag, UserCheck, UserMinus, UserPlus, Users, X } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDaysKey, CONTACT_STATUS_LABEL, cn, dayKey, fmtDate } from "@/lib/utils";
import type { Contact, ContactStatus } from "@/lib/types";
import { SolidTile } from "@/components/stat-tile";
import { Avatar, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";
import { StatusBadge, TagChip, WhatsAppButton } from "@/components/contacts/bits";
import { hrefWith, param, phoneDigits } from "@/components/contacts/helpers";

export const metadata = { title: "Clients & contacts" };

const LIMIT = 200;
const STATUSES: ContactStatus[] = ["client", "prospect", "ancien"];

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const supabase = await createClient();
  const q = param(sp.q)?.slice(0, 60);
  const statutRaw = param(sp.statut) as ContactStatus | undefined;
  const statut = statutRaw && STATUSES.includes(statutRaw) ? statutRaw : undefined;
  const tag = param(sp.tag);
  const since30 = addDaysKey(dayKey(), -30);

  const base = () => supabase.from("contacts").select("id", { count: "exact", head: true }).overlaps("entity_ids", scope.ids);

  // Recherche par téléphone : comparaison sur les chiffres seuls
  const digits = q && /^[\d\s+().-]+$/.test(q) ? phoneDigits(q) : "";
  const byPhone = digits.length >= 3;

  let list = supabase.from("contacts").select("*", { count: "exact" }).overlaps("entity_ids", scope.ids);
  if (statut) list = list.eq("status", statut);
  if (tag) list = list.contains("tags", [tag]);
  if (q && !byPhone) {
    const safe = q.replace(/[,()%*\\]/g, " ").trim();
    if (safe) list = list.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
  }
  list = list.order("full_name");
  if (!byPhone) list = list.limit(LIMIT);

  const [{ count: nClients }, { count: nProspects }, { count: nAnciens }, { count: nNew }, { data: tagRows }, { data: rows, count }] = await Promise.all([
    base().eq("status", "client"),
    base().eq("status", "prospect"),
    base().eq("status", "ancien"),
    base().gte("created_at", since30),
    supabase.from("contacts").select("tags").overlaps("entity_ids", scope.ids),
    list,
  ]);

  let contacts = (rows ?? []) as Contact[];
  let total = count ?? contacts.length;
  if (byPhone) {
    contacts = contacts.filter((c) => phoneDigits(c.phone).includes(digits));
    total = contacts.length;
    contacts = contacts.slice(0, LIMIT);
  }

  // Tags les plus utilisés du périmètre
  const freq = new Map<string, number>();
  for (const r of (tagRows ?? []) as Pick<Contact, "tags">[]) for (const t of r.tags ?? []) freq.set(t, (freq.get(t) ?? 0) + 1);
  const topTags = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const link = (p: { statut?: string; tag?: string; q?: string }) => hrefWith("/contacts", { q, statut, tag, ...p });
  const filtered = !!(q || statut || tag);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients & contacts"
        subtitle={scope.current ? `Fiches de ${scope.current.name}` : `Tous les établissements de votre périmètre`}
        actions={
          <LinkButton href="/contacts/nouveau">
            <UserPlus className="size-4" /> Nouveau contact
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile tone="brand" href={link({ statut: "client", tag: "", q: "" })} label="Clients" value={nClients ?? 0} sub="Avec au moins un achat ou abonnement" icon={<UserCheck />} watermark={<UserCheck />} />
        <SolidTile tone="accent" href={link({ statut: "prospect", tag: "", q: "" })} label="Prospects" value={nProspects ?? 0} sub="À convertir en clients" icon={<Sparkles />} watermark={<Sparkles />} />
        <SolidTile tone="violet" href={link({ statut: "ancien", tag: "", q: "" })} label="Anciens clients" value={nAnciens ?? 0} sub="À relancer avec une offre" icon={<UserMinus />} watermark={<UserMinus />} />
        <SolidTile tone="green" label="Nouveaux en 30 j" value={nNew ?? 0} sub="Contacts créés ce dernier mois" icon={<UserPlus />} watermark={<UserPlus />} />
      </div>

      {/* Recherche et filtres */}
      <Card className="space-y-4 p-4 sm:p-5">
        <form action="/contacts" className="flex gap-2">
          {statut && <input type="hidden" name="statut" value={statut} />}
          {tag && <input type="hidden" name="tag" value={tag} />}
          <span className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Nom, téléphone ou e-mail…"
              className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50"
            />
          </span>
          <button type="submit" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600">
            <Search className="size-4 sm:hidden" />
            <span className="hidden sm:inline">Rechercher</span>
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          {[{ id: undefined, label: "Tous" }, ...STATUSES.map((s) => ({ id: s, label: CONTACT_STATUS_LABEL[s] }))].map((s) => (
            <Link
              key={s.label}
              href={link({ statut: s.id ?? "" })}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
                statut === s.id ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25" : "bg-canvas text-slate-600 hover:bg-brand-50 hover:text-brand-600",
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>
        {topTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="size-4 text-accent-500" />
            {topTags.map(([t, n]) => (
              <Link
                key={t}
                href={link({ tag: tag === t ? "" : t })}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition",
                  tag === t ? "bg-accent-500 text-white ring-accent-500" : "bg-white text-slate-600 ring-line hover:bg-accent-50 hover:text-accent-700",
                )}
              >
                {t} <span className={tag === t ? "text-white/80" : "text-slate-400"}>{n}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          <b className="font-display text-ink">{total}</b> contact{total > 1 ? "s" : ""}
          {total > contacts.length && <> · {contacts.length} affichés, affinez la recherche</>}
        </p>
        {filtered && (
          <Link href="/contacts" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-500 hover:underline">
            <X className="size-4" /> Effacer les filtres
          </Link>
        )}
      </div>

      {contacts.length === 0 ? (
        <Card>
          <Empty
            icon={<Users className="size-6" />}
            title={filtered ? "Aucun contact ne correspond" : "Aucun contact pour l'instant"}
            text={filtered ? "Essayez un autre nom, un autre numéro ou retirez un filtre." : "Ajoutez vos premiers clients et prospects."}
            action={
              <LinkButton href="/contacts/nouveau">
                <UserPlus className="size-4" /> Nouveau contact
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <>
          {/* Bureau : tableau */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas/60 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-5 py-3">Contact</th>
                    <th className="px-3 py-3">Téléphone</th>
                    <th className="px-3 py-3">Établissements</th>
                    <th className="px-3 py-3">Tags</th>
                    <th className="px-3 py-3">Statut</th>
                    <th className="px-5 py-3 text-right">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {contacts.map((c) => (
                    <tr key={c.id} className="group transition hover:bg-brand-50/40">
                      <td className="px-5 py-3">
                        <Link href={`/contacts/${c.id}`} className="flex items-center gap-3">
                          <Avatar name={c.full_name} size={38} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink group-hover:text-brand-600">{c.full_name}</span>
                            <span className="block truncate text-xs text-muted">{c.email ?? `Depuis le ${fmtDate(c.created_at)}`}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{c.phone ?? <span className="text-slate-300">–</span>}</td>
                      <td className="px-3 py-3">
                        <EntityDots ids={c.entity_ids} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((t) => (
                            <TagChip key={t}>{t}</TagChip>
                          ))}
                          {c.tags.length > 3 && <span className="text-[11px] text-muted">+{c.tags.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.phone && (
                            <a href={`tel:${c.phone.replace(/\s/g, "")}`} title="Appeler" className="grid size-9 place-items-center rounded-xl border border-line text-slate-500 transition hover:border-brand-200 hover:text-brand-600">
                              <Phone className="size-4" />
                            </a>
                          )}
                          {c.whatsapp_optin && <WhatsAppButton phone={c.phone} />}
                          <Link href={`/contacts/${c.id}`} className="grid size-9 place-items-center rounded-xl text-slate-300 transition hover:bg-canvas hover:text-brand-500" aria-label="Ouvrir la fiche">
                            <ChevronRight className="size-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile : cartes */}
          <ul className="space-y-2.5 md:hidden">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-card">
                <Link href={`/contacts/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={c.full_name} size={42} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{c.full_name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{c.phone ?? c.email ?? "Sans coordonnées"}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <EntityDots ids={c.entity_ids} />
                      <StatusBadge status={c.status} />
                      {c.tags.slice(0, 1).map((t) => (
                        <TagChip key={t}>{t}</TagChip>
                      ))}
                    </span>
                  </span>
                </Link>
                {c.whatsapp_optin && <WhatsAppButton phone={c.phone} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
