# Moov'Up CRM — brief V2 (commun à tous les agents)

Projet : `C:\Users\Guest 1\Documents\MoovUp-CRM` — Next.js 15.5 App Router, React 19, TypeScript strict, Tailwind v4, Supabase, lucide-react, recharts 3. Pas de nouveau package npm.
CRM du **groupe Moov'Up (Agadir)**, 7 établissements (`src/lib/entities.ts`) : Moov'Up Sports, Lady Moov'Up, Moov'Up Kids, Power Gym (sport) ; Anais Beauty Clinic (médecine esthétique) ; Anais Institut (beauté/hammam) ; Evolve Hommes (barbier). Utilisateurs = l'équipe (rôles `direction | manager | reception | staff`).

## PRIORITÉ ABSOLUE DE L'UTILISATEUR : UI/UX « très très utile, minimaliste, très bon »
Le design vient d'être refait en **minimaliste**. Respecte-le strictement :
- Surfaces blanches `rounded-xl border border-line bg-white`, fond `bg-canvas`, **pas** de dégradés, pas de `shadow-xl`, pas de `rounded-3xl`, pas de tuiles pleine couleur, pas d'emojis décoratifs.
- Typographie : Inter. Titres de page via `PageHeader` (text-xl/2xl semibold). Titres de carte `text-sm font-semibold`. Texte secondaire `text-[13px] text-muted`. Chiffres `tabular-nums font-semibold`. Évite `font-extrabold` et `font-display`.
- Une seule couleur d'action : bleu `brand-500`. Orange `accent-500` uniquement pour l'action principale « Encaisser » et les alertes. Couleurs d'établissement seulement en petits points (`EntityBadge`, `EntityDots`) ou `EntityMark` (pastille teintée).
- Icônes lucide `size-4`, grises (`text-slate-400`) sauf état actif.
- Composants à utiliser (`src/components/ui.tsx`) : `Button`, `LinkButton`, `buttonClass(variant)` (variants primary=orange, brand, dark, secondary, ghost, danger), `Card`, `CardHeader`, `PageHeader`, `Badge` (tones), `Avatar`, `Kpi`, `Field`, `Input`, `Select`, `Textarea`, `SectionTitle`, `Empty`, `ErrorNote`, **`Segmented`** (onglets), **`DescList`**, **`Kbd`**, **`tableClass`** (tableaux). Indicateurs : `SolidTile` (désormais une carte KPI sobre, 4 max par page, en haut), `ShortcutTile`. Établissements : `src/components/entity-icon.tsx`. Client : `ContactPicker`. Formulaires : `ActionForm` + `SubmitButton`, `ConfirmButton`, `BackLink`.
- **Utile avant tout** : l'action la plus fréquente de chaque page est visible immédiatement (bouton en haut à droite) ; listes avec recherche/filtres simples (`Segmented` pour les filtres à 2-5 valeurs) ; états vides avec l'action qui débloque (`Empty` + bouton) ; confirmations avant les actions destructrices ; formulaires courts (champs essentiels d'abord, options avancées repliées dans `<details>`) avec valeurs par défaut intelligentes ; libellés clairs en français, sans jargon ; montants `mad()`, dates `fmtDate`.
- **Retour d'action** : après chaque action réussie, appelle `flash("Message court")` (`src/lib/flash.ts`) avant `redirect`/`revalidatePath` → toast automatique.
- **Images** : tout ajout d'image passe OBLIGATOIREMENT par `<ImageInput name="…" />` (`src/components/image-input.tsx`) qui compresse sans perte visible (WebP 0,9, max 2400 px). En démo, stocke l'image en data URL (ou `URL` fictive) ; en réel, bucket Supabase Storage.
- Mobile 375 px sans débordement horizontal : grilles `[&>*]:min-w-0`, tableaux dans `overflow-x-auto` ou cartes empilées sous `sm`.

## Fichiers partagés (lecture seule sauf mention contraire)
`src/lib/types.ts`, `entities.ts`, `utils.ts`, `auth.ts` (`getProfile`, `getScope()` → `{current, ids, allowed}`, `requireManager`, `requireDirection`, `allowedEntities`), `data.ts` (`byId`, `getTeam`, `getContacts`, `monthKey`, `lastMonths`), `settings.ts` (`getSettings`, type `Settings`), `hooks.ts`, `flash.ts`, `image-compress.ts`, `nav.ts` (toutes les routes sont déjà dans le menu), `demo.ts`, `demo-seed.ts`, `supabase/schema.sql`, tous les composants listés ci-dessus, `src/app/(app)/layout.tsx`.

## Règles techniques
1. **Périmètre** : `.in("entity_id", scope.ids)` ; contacts : `.overlaps("entity_ids", scope.ids)`. À l'insertion, refuser un `entity_id` hors `scope.allowed`.
2. **Faux client démo** : select(cols,{count,head}), insert, update, delete, upsert, eq, neq, in, gte, gt, lt, lte, ilike, is, not, or("a.ilike.%x%,b.ilike.%x%"), contains, overlaps, order, limit, single, maybeSingle. **Pas de jointures** : charger séparément + `byId`. Une table inconnue renvoie `[]` (elle est créée à la 1re insertion).
3. **Tes tables** : types dans `src/lib/types-<module>.ts` ; SQL (create table + RLS avec `can_see_entity(entity_id)` / `my_role()` / `is_direction()` déjà définies) dans `supabase/<module>.sql` ; données de démo réalistes dans `src/lib/seed/<module>.ts` (fonction déjà branchée, reçoit `db` en lecture et des helpers `uid, rnd, pick, int, day, at` ; renvoie `{ ta_table: rows }`). Le cache démo est sur `globalThis.__moovupCrmV2` : **ne touche pas `demo.ts`** ; le serveur sera relancé à la fin.
4. Server actions dans `src/actions/<module>.ts` ("use server"), `(state: FormState, formData) => Promise<FormState>` pour `ActionForm`. Ajoute une ligne `activities` sur la fiche client pour les événements importants.
5. Dates : fuseau Africa/Casablanca via utils (`dayKey`, `agadirToIso`, `isoToAgadir`, `addDaysKey`, `daysUntil`).
6. Rôles : pages de gestion protégées (`requireManager()` / `requireDirection()` selon `nav.ts`).
7. **Propriété des fichiers** : ne crée/modifie QUE les fichiers de ta mission. Besoin d'un helper ? mets-le dans tes fichiers.
8. Vérification : `npx tsc --noEmit` + `npx eslint <tes fichiers>` propres. **Ne lance ni `next dev` ni `next build`.** Si un serveur répond sur `http://localhost:3200`, tu peux `curl -s -b "demo_user=00000000-0000-4000-8000-000000000001" http://localhost:3200/<route>` (direction ; `...0002` manager lady+kids ; `...0003` réception clinic+institut ; cookie `scope=<id>` pour un établissement).
9. Résumé final très court : routes créées, ce qui reste.
