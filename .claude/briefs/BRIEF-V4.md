# Moov'Up — brief V4 (demandes du propriétaire, à faire vite et bien)

Lis d'abord `.claude/briefs/BRIEF-V3.md` puis `.claude/briefs/BRIEF-V2.md` (règles techniques, design minimaliste, démo, propriété des fichiers) : toujours valables.
Projets : CRM général `C:\Users\Guest 1\Documents\MoovUp-CRM` (démo port 3200) et CRM coaching `C:\Users\Guest 1\Documents\MoovUp-Coach` (démo port 3100, design plus ancien « coloré », même stack Next.js 15 / Supabase / Tailwind v4, démo dans `src/lib/demo.ts`).

## Demandes du propriétaire (résumé)
1. Bugs : « Équipe & droits » ne marche pas depuis le menu ; la rubrique Administration « lag » et renvoie sur Pilotage dirigeant (cause trouvée : en ligne une page met ~6 s, le menu latéral long se remet en haut et le 2e clic tombe sur un autre lien) ; l'affichage du calendrier doit être bon (aujourd'hui 3 rangées de filtres en puces + indicateurs repoussent la grille en bas, noms tronqués) ; le bouton mode sombre doit être dans l'en-tête.
2. Affichage condensé et minimaliste : regrouper les éléments secondaires dans des listes déroulantes / panneaux repliables, écran efficace.
3. Mode tablette sur tous les écrans où c'est utile : grandes cibles, accès rapide.
4. Stock détaillé : par établissement ET vue globale des 7 ; transferts.
5. Ajouter un établissement depuis l'application.
6. Caisse détaillée comme une vraie caisse, liée au stock.
7. Répertoire fournisseurs ; chaque dépense assignée à un fournisseur.
8. Collaborations / partenariats : date, nature, conditions, photos.
9. Export de TOUS les tableaux et données, avec en-tête Moov'Up + qui a exporté + quand (Excel/CSV et PDF).
10. QR code que le client scanne pour signaler une panne / un problème.
11. Rapports clients bien organisés : un client, une sélection ou tous, par période.
12. Langue anglaise en plus (français, arabe, anglais).
13. Même chose pour le CRM coaching ; + liaison montres (Apple Watch / Samsung) pour sommeil, pas, fréquence cardiaque ; + application Android.

## Règles communes V4
- Rapidité perçue : aucune page ne doit faire de travail inutile ; pas de calcul O(n²) ; charger seulement ce qui est affiché.
- Libellés : FR par défaut ; si tu crées des textes de navigation/en-tête, ajoute les clés dans les dictionnaires (`src/lib/i18n/*`) — l'agent Shell gère l'anglais.
- Images ajoutées : toujours via `ImageInput` (compression).
- Exports : utilise le module d'export commun (`src/lib/export/` créé par l'agent Exports) s'il existe quand tu en as besoin ; sinon expose tes données et laisse l'agent Exports brancher le bouton.
- Mode tablette : la classe `tablet` est posée sur `<html>` (cookie `ui=tablet`) ; styles globaux dans `src/app/tablet.css` ; barre d'accès rapide `src/components/tablet/dock.tsx`.
- Ne modifie QUE tes fichiers. Vérifie `npx tsc --noEmit` + eslint sur tes fichiers. Ne lance ni `next dev` ni `next build`. Résumé final très court en français.
