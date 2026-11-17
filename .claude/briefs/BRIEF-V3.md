# Moov'Up CRM — brief V3 : UX « très très bonne » + recherche et filtres partout

Lis d'abord ENTIÈREMENT `.claude/briefs/BRIEF-V2.md` (règles techniques, design minimaliste, faux client démo, propriété des fichiers) : il reste valable. Ce brief ajoute la phase UX.

## Objectif
Réception et managers doivent sentir la différence **chaque jour** : moins de clics, moins de frappe, tout immédiat, rien de perdu, tout se retrouve.

## Nouveaux éléments communs (déjà créés, à utiliser)
- `src/components/list-toolbar.tsx` : `ListToolbar` (recherche instantanée + filtres en puces synchronisés avec l'URL) et `matchesQuery(q, ...champs)` (recherche sans accents/casse + chiffres de téléphone) pour filtrer côté serveur. **Toute page de liste doit avoir une recherche dans ses données + des filtres utiles.**
- `src/components/quick-view/contact-link.tsx` : `ContactLink({ id, name })` — à utiliser **partout** où un nom de client s'affiche (le module Aperçu rapide en fait un panneau latéral).
- `src/lib/i18n/` : `getLang()` (serveur), `t(lang, key, vars)` (`core.ts`), `useT()` / `LangProvider` (`client.tsx`), dictionnaires `fr.ts` / `ar.ts`. Les clés sont préfixées par module (`nav.*`, `tablette.*`, `acces.*`…).
- `src/components/pwa/register.tsx` : `PwaRegister` (déjà monté dans le layout).
- Table `saved_views` (vues enregistrées) : `{ id, user_id, label, href, icon?, created_at }`.
- Le serveur de démo tourne sur `http://localhost:3200` (s'il répond). Ne lance ni `next dev` ni `next build`.

## Règles UX à respecter partout
1. Action la plus fréquente visible sans scroller ; raccourci clavier quand c'est pertinent (voir module Shell : registre `src/components/shell/shortcuts.ts`).
2. Retour immédiat : mises à jour optimistes (`useOptimistic`) pour les changements d'état simples ; `flash()` après chaque action ; annulation possible (5 s) plutôt que « Êtes-vous sûr ? » pour les actions réversibles.
3. Zéro perte de saisie : formulaires via `ActionForm` (conserve les champs en cas d'erreur).
4. États vides utiles, erreurs claires en français avec la solution.
5. Mobile 375 px sans débordement, cibles ≥ 36 px, accessibilité clavier/lecteur d'écran.
6. Mode sombre : n'utilise que les classes de couleurs du thème (`bg-white`, `bg-canvas`, `text-ink`, `text-muted`, `border-line`, `slate-*`, `brand-*`, `accent-*`…) ; pas de couleurs codées en dur en `style=` sauf couleurs d'établissement.
7. Vérification : `npx tsc --noEmit`, `npx eslint <tes fichiers>`, `curl` de tes routes (cookie `demo_user=00000000-0000-4000-8000-000000000001`). Résumé final très court.
