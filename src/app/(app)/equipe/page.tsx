import Link from "next/link";
import { BadgeCheck, ConciergeBell, Crown, Info, Mail, Phone, UserPlus, Users } from "lucide-react";
import { allowedEntities, getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ENTITIES } from "@/lib/entities";
import type { Profile, Role } from "@/lib/types";
import { ROLE_LABEL, cn } from "@/lib/utils";
import { updateMember } from "@/actions/team";
import { SolidTile } from "@/components/stat-tile";
import { Avatar, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { NoResults, ResultCount, clearHref, entityFilter, hasFilters, sortRows } from "@/components/reports/list-kit";
import { EntityDots } from "@/components/entity-icon";
import { MemberEditor } from "@/components/team/member-editor";

export const metadata = { title: "Équipe" };

const ROLE_ORDER: Role[] = ["direction", "manager", "reception", "staff"];
const ROLE_META: Record<Role, { title: string; hint: string }> = {
  direction: { title: "Direction", hint: "Accès à tout le groupe" },
  manager: { title: "Managers", hint: "Pilotent leurs établissements" },
  reception: { title: "Réception", hint: "Accueil, caisse et rendez-vous" },
  staff: { title: "Équipe", hint: "Coachs, praticiens, esthéticiennes…" },
};

type SP = { q?: string; role?: string; etab?: string; statut?: string; tri?: string };
const FILTER_PARAMS = ["q", "role", "etab", "statut", "tri"];

export default async function TeamPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const me = await requireManager();
  const scope = await getScope();
  const isDirection = me.role === "direction";
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("full_name");
  const mine = allowedEntities(me);
  const members = ((data ?? []) as Profile[]).filter((p) => isDirection || !p.entity_ids.length || p.entity_ids.some((e) => mine.includes(e)));
  const active = members.filter((p) => p.active);
  const entities = ENTITIES.map((e) => ({ id: e.id, short: e.short, color: e.color, soft: e.soft }));

  const count = (r: Role) => active.filter((p) => p.role === r).length;

  // Recherche et filtres (côté serveur)
  const q = (sp.q ?? "").trim();
  const role = ROLE_ORDER.includes(sp.role as Role) ? (sp.role as Role) : null;
  const etab = scope.allowed.some((e) => e.id === sp.etab) ? sp.etab! : null;
  const statut = sp.statut === "actif" || sp.statut === "inactif" ? sp.statut : null;
  const tri = sp.tri === "poste" || sp.tri === "recent" ? sp.tri : "nom";
  const filtered = sortRows(
    members.filter(
      (p) =>
        matchesQuery(q, p.full_name, p.job_title, p.phone, p.email, ROLE_LABEL[p.role]) &&
        (!role || p.role === role) &&
        (!etab || !p.entity_ids.length || (p.entity_ids as string[]).includes(etab)) &&
        (!statut || (statut === "actif" ? p.active : !p.active)),
    ),
    (p) => (tri === "poste" ? p.job_title ?? ROLE_LABEL[p.role] : tri === "recent" ? p.created_at : p.full_name || p.email),
    tri === "recent" ? "desc" : "asc",
  );
  const isFiltered = hasFilters(sp, ["q", "role", "etab", "statut"]);
  const visibleEntities = scope.allowed.map((e) => ({ id: e.id, short: e.short }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Équipe"
        subtitle={isDirection ? "Rôles et établissements de chaque membre" : `Membres de vos établissements · ${scope.allowed.map((e) => e.short).join(", ")}`}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Membres actifs" value={active.length} sub={`${members.length - active.length} désactivé(s)`} icon={<Users />} />
        <SolidTile label="Managers" value={count("manager")} sub={`${count("direction")} à la direction`} icon={<Crown />} />
        <SolidTile label="Réception" value={count("reception")} sub="Accueil et caisse" icon={<ConciergeBell />} />
        <SolidTile label="Équipe terrain" value={count("staff")} sub="Coachs et praticiens" icon={<BadgeCheck />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
        <div className="space-y-5">
          <ListToolbar
            className="mb-0"
            placeholder="Nom, poste, téléphone…"
            filters={[
              { param: "role", label: "Tous les rôles", options: ROLE_ORDER.map((r) => ({ value: r, label: ROLE_META[r].title, count: members.filter((p) => p.role === r).length })) },
              ...entityFilter(visibleEntities, Object.fromEntries(visibleEntities.map((e) => [e.id, members.filter((p) => !p.entity_ids.length || (p.entity_ids as string[]).includes(e.id)).length]))),
              { param: "statut", label: "Tous", options: [{ value: "actif", label: "Actifs", count: active.length }, { value: "inactif", label: "Désactivés", count: members.length - active.length }] },
              { param: "tri", label: "Nom", options: [{ value: "poste", label: "Poste" }, { value: "recent", label: "Récents" }] },
            ]}
            right={<ResultCount shown={filtered.length} total={members.length} filtered={isFiltered} unit="membre" />}
          />
          {!filtered.length && (
            <Card>
              <NoResults q={q} href={clearHref("/equipe", sp, FILTER_PARAMS)} what="membre" />
            </Card>
          )}
          {ROLE_ORDER.map((r) => {
            const list = filtered.filter((p) => p.role === r);
            if (!list.length) return null;
            const meta = ROLE_META[r];
            return (
              <Card key={r} className="overflow-hidden">
                <CardHeader
                  title={
                    <>
                      {meta.title} <span className="ml-1 font-normal tabular-nums text-muted">{list.length}</span>
                    </>
                  }
                  subtitle={meta.hint}
                />
                <ul className="divide-y divide-line border-t border-line">
                  {list.map((p) => {
                    const self = p.id === me.id;
                    return (
                      <li key={p.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5", !p.active && "bg-slate-50/70")}>
                        <span className={cn("relative", !p.active && "opacity-50 grayscale")}>
                          <Avatar name={p.full_name || p.email} size={36} />
                          <span
                            className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white", p.active ? "bg-emerald-500" : "bg-slate-300")}
                            aria-label={p.active ? "Actif" : "Désactivé"}
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium text-ink">{p.full_name || p.email}</span>
                            {self && <Badge tone="brand">Vous</Badge>}
                            {!p.active && <Badge tone="gray">Désactivé</Badge>}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            <span>{p.job_title ?? ROLE_LABEL[p.role]}</span>
                            {p.phone && (
                              <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 tabular-nums hover:text-brand-600">
                                <Phone className="size-3" /> {p.phone}
                              </a>
                            )}
                            <a href={`mailto:${p.email}`} className="inline-flex min-w-0 items-center gap-1 hover:text-brand-600">
                              <Mail className="size-3 shrink-0" /> <span className="truncate">{p.email}</span>
                            </a>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center">
                          {p.entity_ids.length ? <EntityDots ids={p.entity_ids} /> : <span className="text-xs text-muted">Tous les établissements</span>}
                        </div>
                        {isDirection && (
                          <div className="flex w-full flex-wrap justify-end sm:w-auto [&:has(form)]:w-full">
                            <MemberEditor
                              action={updateMember.bind(null, p.id)}
                              entities={entities}
                              member={{ role: p.role, entity_ids: p.entity_ids, job_title: p.job_title, phone: p.phone, active: p.active }}
                              self={self}
                              name={p.full_name || p.email}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <UserPlus className="size-4 text-slate-400" /> Ajouter un membre
            </p>
            <ol className="mt-3 space-y-2.5 text-[13px] text-slate-600">
              {[
                <>
                  Il crée son compte sur la page{" "}
                  <Link href="/signup" className="font-medium text-brand-600 hover:underline">
                    Inscription
                  </Link>{" "}
                  avec son e-mail.
                </>,
                <>Il apparaît ici, sans accès particulier.</>,
                <>La direction clique sur « Modifier » pour lui donner un rôle et ses établissements.</>,
              ].map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold tabular-nums text-slate-500">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </Card>
          <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
            {isDirection
              ? "Un compte désactivé ne peut plus se connecter ; son historique (ventes, rendez-vous, notes) est conservé."
              : "Seule la direction peut modifier les rôles et les établissements attribués."}
          </p>
        </aside>
      </div>
    </div>
  );
}
