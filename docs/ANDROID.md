# Moov'Up CRM sur Android (Google Play)

Le CRM est déjà une application web **installable** (PWA). Pour le publier sur le **Google Play Store**, on l'emballe dans une petite application Android appelée **TWA** (*Trusted Web Activity*) : Chrome affiche le site en plein écran, sans barre d'adresse. C'est gratuit, il n'y a pas de deuxième application à maintenir, et chaque mise à jour du site arrive immédiatement dans l'application.

> L'équipe peut aussi simplement **installer** le CRM sans Play Store : ouvrir `https://crm.moovup.ma` dans Chrome → menu ⋮ → **Installer l'application**. Le Play Store est utile pour les tablettes d'accueil gérées et pour une installation « officielle ».

Ce qui est déjà prêt :

| Élément | Fichier | État |
|---|---|---|
| Manifeste (nom, couleurs Moov'Up, icônes 192/512 normales et « maskable », raccourcis Caisse / Entrées / Agenda, catégories) | `src/app/manifest.ts` | prêt |
| Captures d'écran pour le Play Store | `public/screenshots/` | à ajouter (étape 6) |
| Fichier de liaison site ↔ application | `public/.well-known/assetlinks.json` | modèle : empreinte à remplir (étape 5) |

Nom de paquet proposé : **`ma.moovup.crm`** (définitif après la 1re publication).

---

## 1. Avant de commencer

1. Le site doit être **en ligne en HTTPS** sur son domaine définitif : `https://crm.moovup.ma`.
2. Ouvrir `https://crm.moovup.ma/manifest.webmanifest` : le manifeste doit s'afficher.
3. Ouvrir `https://crm.moovup.ma/.well-known/assetlinks.json` **en navigation privée** (sans être connecté) : le fichier doit s'afficher, et **pas** la page de connexion. Sinon, ajouter `/.well-known` aux chemins publics de `src/lib/supabase/middleware.ts`.

## 2. Générer l'application gratuitement avec PWABuilder

1. Aller sur **https://www.pwabuilder.com** (gratuit, sans compte).
2. Coller `https://crm.moovup.ma` → **Start**. Corriger les points en rouge s'il y en a ; les avertissements jaunes sont facultatifs.
3. **Package for stores** → **Android** → **Generate Package**, avec :
   - **Package ID** : `ma.moovup.crm`
   - **App name** : `Moov'Up CRM` — **Short name** : `Moov'Up`
   - **Version** `1.0.0`, **Version code** `1` (augmenter de 1 à chaque nouvelle publication)
   - **Display mode** : *standalone* ; **Orientation** : *any* (tablettes d'accueil en paysage)
   - **Signing key** : « Create new » (nom, organisation Moov'Up, pays MA).
4. Télécharger le ZIP : `*.aab` (pour Google Play), `*.apk` (pour tester), `signing.keystore` + `signing-key-info.txt` (**clé de signature et mot de passe : à garder en 2 copies sûres, sans elle aucune mise à jour possible**), `assetlinks.json`.

> Alternative en ligne de commande : **Bubblewrap** (`npm i -g @bubblewrap/cli`, `bubblewrap init --manifest https://crm.moovup.ma/manifest.webmanifest`, `bubblewrap build`).

## 3. Tester l'APK sur un téléphone ou une tablette

1. Copier le `.apk` sur l'appareil (câble USB, Google Drive, WhatsApp vers soi-même) et l'ouvrir.
2. Autoriser l'installation d'**applications inconnues** pour l'application qui ouvre le fichier (Fichiers, Drive…).
3. Lancer **Moov'Up CRM** et vérifier : connexion, caisse, scan des cartes (caméra), agenda, mode tablette, rotation, bouton retour.
4. Une barre d'adresse en haut = liaison pas encore validée (étape 5) ; l'application fonctionne quand même.

## 4. Publier sur Google Play

1. **Compte développeur** (par le propriétaire, au nom de Moov'Up) : https://play.google.com/console — frais uniques de **25 $**, pièce d'identité ; pour un compte « Organisation », numéro D-U-N-S (gratuit, prévoir quelques jours).
2. **Créer une application** « Moov'Up CRM », Français, Application, Gratuite.
3. **Usage interne uniquement ?** Le plus simple est de publier en **test interne** ou **test fermé** (liste des e-mails de l'équipe) : l'application n'apparaît pas publiquement dans le Store mais s'installe depuis un lien Google Play.
4. Fiche : descriptions, icône 512×512 (`public/icons/icon-512.png`), image 1024×500, au moins 2 captures d'écran.
5. Questionnaires : classification, public cible, **sécurité des données** (noms, téléphones et e-mails des clients, paiements enregistrés ; chiffrés en transit), adresse de la **politique de confidentialité**.
6. Créer une version → envoyer le `.aab` → accepter la **signature par Google Play** → envoyer en examen. (Compte personnel récent : test fermé de 12 testeurs pendant 14 jours obligatoire avant la production.)

## 5. Mettre l'empreinte dans `assetlinks.json`

1. Play Console → **Tester et publier → Configuration → Intégrité de l'application → Signature d'application**.
2. Copier l'**empreinte SHA-256** de la « clé de signature d'application » (`AB:12:CD:…`).
3. Dans `public/.well-known/assetlinks.json` : remplacer la 1re ligne `A_REMPLACER…` par cette empreinte ; la 2e par l'empreinte de `signing-key-info.txt` (pour l'APK de test) ou la supprimer.
4. Mettre le site en ligne et vérifier : https://developers.google.com/digital-asset-links/tools/generator (`crm.moovup.ma`, `ma.moovup.crm`, empreinte → « Test statement »).
5. Réinstaller l'application : la barre d'adresse disparaît.

## 6. Captures d'écran et mises à jour

- Enregistrer des captures dans `public/screenshots/` : `mobile-1.png`, `mobile-2.png`… (portrait 1080×1920) et `large-1.png`… (paysage 1920×1080, tablette). Elles sont ajoutées automatiquement au manifeste.
- Le contenu se met à jour tout seul (c'est le site). Pour une nouvelle version de l'application (icône, nom, couleurs) : régénérer avec PWABuilder **avec la même clé** (option « Use mine »), augmenter le *Version code*, envoyer le nouvel `.aab`.

## 7. Montres connectées

Les données des montres (sommeil, pas, fréquence cardiaque) concernent les adhérents suivis en coaching : elles sont gérées par **Moov'Up Coach** (page *Santé connectée*, import des exports Apple Santé / Samsung Health, et API `POST /api/health/sync` pour l'application Android qui lira Health Connect). Voir `docs/ANDROID.md` du projet Moov'Up Coach.
