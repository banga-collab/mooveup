# Mettre le Moov'Up CRM en ligne

Ce guide se suit dans l'ordre, sans connaissances techniques. Comptez environ **1 heure** pour la partie indispensable (étapes 1 à 6). WhatsApp et le paiement CMI (étapes 7 et 8) peuvent attendre : le CRM fonctionne sans eux.

À la fin, la page **Paramètres → État du système** (`/parametres/systeme`) doit être entièrement verte.

> **Règle d'or des clés secrètes** : ne les envoyez jamais par WhatsApp ou par e-mail, ne les mettez jamais dans un fichier envoyé sur GitHub. Elles se collent uniquement dans Vercel (et dans `.env.local` sur votre ordinateur).

---

## 1. Créer la base de données (Supabase)

1. Allez sur **supabase.com** → *Start your project* → créez un compte (avec l'adresse e-mail de la société, pas une adresse personnelle).
2. Cliquez sur **New project** :
   - **Name** : `moovup-crm`
   - **Database Password** : cliquez sur *Generate a password*, puis **notez-le dans un coffre-fort de mots de passe** (il ne sera plus affiché).
   - **Region** : **West EU (Paris)** — la plus proche du Maroc, et dans la même zone que le serveur Vercel (Paris).
   - Offre : *Free* pour commencer ; passez à *Pro* quand l'équipe utilise le CRM tous les jours (sauvegardes Supabase quotidiennes, pas de mise en pause).
3. Attendez 1 à 2 minutes que le projet soit prêt.

## 2. Créer les tables (un seul script)

1. Dans Supabase, menu de gauche : **SQL Editor** → **New query**.
2. Ouvrez le fichier `supabase/000_tout.sql` du dossier du CRM, copiez **tout** son contenu, collez-le dans l'éditeur.
3. Cliquez sur **Run**. Le message *Success. No rows returned* indique que tout est créé : tables, droits d'accès (chaque membre ne voit que ses établissements) et espaces de stockage.

Ce script peut être relancé sans risque : il ne supprime aucune donnée. Après une mise à jour du CRM qui ajoute un module, relancez-le simplement.

> Pour les développeurs : `000_tout.sql` est généré à partir de tous les fichiers `supabase/*.sql` par la commande `node scripts/build-sql.mjs`. À relancer quand un module ajoute ou modifie un fichier SQL.

## 3. Vérifier les espaces de stockage (buckets)

Menu **Storage** : trois espaces doivent exister (le script les a créés) :

| Bucket | Visibilité | Contenu |
|---|---|---|
| `sauvegardes` | **Privé** | Sauvegardes automatiques de la nuit (30 dernières) |
| `care-photos` | **Privé** | Photos avant/après de la clinique et de l'institut |
| `justificatifs` | Public | Justificatifs de dépenses |

S'il en manque un : **New bucket**, même nom, et cochez *Public bucket* uniquement pour `justificatifs`.

## 4. Récupérer les clés Supabase

Menu **Project Settings** (roue dentée) → **API** (ou *Data API* / *API Keys*). Gardez cet onglet ouvert, vous allez copier 3 valeurs :

| Dans Supabase | Variable à remplir |
|---|---|
| *Project URL* | `NEXT_PUBLIC_SUPABASE_URL` |
| clé *anon* *public* | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| clé *service_role* (*secret*, cliquez sur *Reveal*) | `SUPABASE_SERVICE_ROLE_KEY` |

La clé *service_role* donne accès à toute la base : elle ne doit **jamais** commencer par `NEXT_PUBLIC_` et ne doit être collée que dans Vercel.

Dans **Authentication → URL Configuration**, mettez plus tard (après l'étape 5) :
- *Site URL* : `https://crm.moovup.ma`
- *Redirect URLs* : `https://crm.moovup.ma/**`

## 5. Mettre le site en ligne (Vercel)

1. Allez sur **vercel.com** → créez un compte (de préférence *Continue with GitHub* si le code est sur GitHub).
2. **Add New → Project** :
   - **Depuis GitHub** (conseillé) : choisissez le dépôt du CRM → *Import*. Chaque modification envoyée sur GitHub sera mise en ligne automatiquement.
   - **Depuis le dossier** (sans GitHub) : sur votre ordinateur, dans le dossier du CRM, lancez `npx vercel` puis `npx vercel --prod` et répondez aux questions (Framework : *Next.js*).
3. Avant de cliquer sur *Deploy*, ouvrez **Environment Variables** et ajoutez une par une (nom exact, valeur collée) :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Étape 4 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Étape 4 |
| `SUPABASE_SERVICE_ROLE_KEY` | Étape 4 (secrète) |
| `CRON_SECRET` | Une longue phrase aléatoire d'au moins 32 caractères (ex. générée par votre coffre-fort de mots de passe). Elle protège les tâches automatiques. |
| `NEXT_PUBLIC_SITE_URL` | `https://crm.moovup.ma` (l'adresse finale, sans `/` à la fin) |

   **Ne mettez pas** `NEXT_PUBLIC_DEMO` : cette variable active les données fictives de démonstration.
4. Cliquez sur **Deploy**. Après 2 à 3 minutes, Vercel affiche une adresse du type `moovup-crm.vercel.app`.
5. Après toute modification de variable : onglet **Deployments** → menu `⋯` du dernier déploiement → **Redeploy**.

### Tâches automatiques (déjà configurées dans `vercel.json`)

| Tâche | Adresse | Fréquence |
|---|---|---|
| Rappels WhatsApp (rendez-vous, abonnements, anniversaires, avis…) | `/api/cron` | toutes les heures |
| Sauvegarde complète vers le bucket `sauvegardes` | `/api/backup` | chaque nuit (vers 2 h, heure du Maroc) |

Vercel envoie automatiquement `CRON_SECRET` à ces adresses. Vous les voyez dans **Settings → Cron Jobs**.

> **Offre gratuite Vercel (Hobby)** : les tâches ne peuvent tourner qu'**une fois par jour**, et le déploiement refuse la ligne « toutes les heures ». Deux solutions :
> - passer à l'offre **Pro** (recommandé pour un usage professionnel) ;
> - ou retirer la ligne `/api/cron` de `vercel.json` et créer un compte gratuit sur **cron-job.org** avec une tâche toutes les heures vers
>   `https://crm.moovup.ma/api/cron?secret=VOTRE_CRON_SECRET`.

## 6. Nom de domaine (ex. crm.moovup.ma)

1. Vercel → votre projet → **Settings → Domains** → saisissez `crm.moovup.ma` → *Add*.
2. Vercel affiche un enregistrement à créer, en général :
   - Type **CNAME**, Nom **crm**, Valeur **cname.vercel-dns.com**
3. Connectez-vous chez le gestionnaire du domaine `moovup.ma` (le registrar où le domaine a été acheté) → *Zone DNS* → ajoutez cet enregistrement.
4. Après quelques minutes (parfois jusqu'à 24 h), Vercel affiche *Valid Configuration* et active le cadenas HTTPS tout seul.
5. Vérifiez que `NEXT_PUBLIC_SITE_URL` vaut bien `https://crm.moovup.ma` (sinon corrigez et *Redeploy*), et mettez la même adresse dans Supabase (fin de l'étape 4).

## 7. Premier compte = Direction

1. Ouvrez `https://crm.moovup.ma/signup` et créez **votre** compte (le gérant).
2. **Le tout premier compte créé devient automatiquement « Direction »** (accès à tout). Tous les comptes suivants arrivent en « staff » sans établissement.
3. Les membres de l'équipe créent ensuite leur compte sur `/signup` ; vous leur donnez rôle et établissements dans **Équipe & droits**.
4. Dans **Paramètres**, renseignez la raison sociale, l'ICE, le RC, l'IF, la patente et la TVA (mentions obligatoires des factures).

## 8. WhatsApp Business Cloud API (facultatif)

Sans cette étape, le CRM prépare les messages et l'équipe les envoie en un clic (liens wa.me). Avec, les rappels partent tout seuls.

1. **Compte Meta Business** : sur **business.facebook.com**, créez le portefeuille « Groupe Moov'Up » et faites la **vérification de l'entreprise** (*Paramètres → Centre de sécurité*), avec les documents légaux (RC, ICE). Comptez quelques jours.
2. **Application** : sur **developers.facebook.com** → *My Apps* → *Create App* → type *Business* → ajoutez le produit **WhatsApp**.
3. **Numéro** : *WhatsApp → API Setup* → *Add phone number*. Utilisez un numéro **qui n'est pas déjà utilisé dans l'application WhatsApp** (ou supprimez-le d'abord de l'application), vérifiez-le par SMS, et choisissez le nom affiché (ex. « Moov'Up »).
4. Notez le **Phone number ID** affiché sous le numéro (une suite de chiffres) → dans le CRM : **Paramètres → WhatsApp**, collez-le et cochez l'activation.
5. **Token permanent** (le token « temporaire » expire en 24 h) :
   - business.facebook.com → *Paramètres → Utilisateurs → Utilisateurs système* → *Ajouter* (rôle Admin) ;
   - *Ajouter des éléments* → votre application → contrôle total ;
   - *Générer un token* → application → permissions `whatsapp_business_messaging` et `whatsapp_business_management` → expiration **Jamais**.
   - Collez-le dans Vercel : variable `WHATSAPP_TOKEN`, puis *Redeploy*.
6. **Modèles de messages** : WhatsApp n'autorise un message libre que dans les 24 h qui suivent un message du client. Pour les rappels (rendez-vous du lendemain, fin d'abonnement, anniversaire, demande d'avis), créez dans *WhatsApp Manager → Modèles de messages* un modèle par rappel, catégorie **Utilité** (Marketing pour les promotions), en français (et en arabe si besoin), avec les mêmes textes que dans **Rappels WhatsApp** du CRM. Meta les valide en quelques minutes à 48 h.
7. **Moyen de paiement** : *WhatsApp Manager → Paramètres de paiement* : ajoutez une carte de la société (Meta facture les conversations au-delà du quota gratuit).

## 9. Paiement en ligne CMI (facultatif)

Sert à encaisser un acompte lors des réservations en ligne.

1. **Contrat** : demandez à votre banque marocaine un contrat de *paiement en ligne (e-commerce) CMI*. Documents habituels : RC, ICE, statuts, RIB, adresse du site (`https://crm.moovup.ma`), conditions générales de vente et politique de remboursement visibles sur le site.
2. Le CMI vous remet :
   - le **Client ID** (identifiant marchand) → variable `CMI_CLIENT_ID` (ou Paramètres → Paiement CMI) ;
   - la **Store Key** (clé du magasin, secrète) → variable `CMI_STORE_KEY` ;
   - l'**adresse de la passerelle** de **test**, puis de **production** → variable `CMI_GATEWAY_URL`.
3. Communiquez au CMI l'**URL de rappel** (callback, serveur à serveur) :
   `https://crm.moovup.ma/api/cmi`
   Les pages de retour client (succès / échec) sont envoyées automatiquement par le CRM à chaque paiement.
4. Faites d'abord un paiement avec la passerelle de **test** et une carte de test du CMI, vérifiez que la réservation passe en « acompte payé », puis remplacez `CMI_GATEWAY_URL` par l'adresse de production et *Redeploy*.
5. Dans **Paramètres → Paiement CMI**, cochez l'activation et le montant de l'acompte (Paramètres → Réservation).

## 10. Vérifier : page « État du système »

Connectez-vous avec le compte Direction → **Paramètres → État du système** (`/parametres/systeme`).

- Chaque ligne **verte** est prête ; chaque ligne **rouge** indique **quoi faire** juste en dessous.
- Les lignes marquées *Facultatif* (WhatsApp, CMI) peuvent rester rouges si vous n'utilisez pas ces services.
- Les valeurs des clés ne sont jamais affichées, seulement leur présence.

Puis, dans **Paramètres → Sauvegarde** (`/parametres/sauvegarde`) :
1. cliquez sur **Sauvegarder dans le stockage** : une ligne « Manuelle » apparaît dans l'historique et un fichier dans *Sauvegardes automatiques* ;
2. cliquez sur **Tout télécharger (JSON)** et rangez ce fichier en lieu sûr (disque externe, Drive de la société). Faites-le **au moins une fois par mois**.

### Restaurer une sauvegarde

**Paramètres → Sauvegarde → Restaurer une sauvegarde** : choisissez un fichier `moovup-sauvegarde-AAAA-MM-JJ.json`, vérifiez l'aperçu (tables et nombre de lignes), cochez la confirmation et tapez `RESTAURER`. Les fiches ayant le même identifiant sont remplacées par celles du fichier, les autres sont ajoutées ; rien n'est supprimé. Les comptes de connexion ne font pas partie des sauvegardes : sur une base neuve, recréez d'abord les comptes de l'équipe, puis relancez la restauration.

---

## En cas de problème

| Symptôme | Solution |
|---|---|
| Le site redirige vers `/setup` | `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` manquante → Vercel, puis *Redeploy*. |
| Erreur « relation … does not exist » | Ré-exécutez `supabase/000_tout.sql` (étape 2). |
| Personne ne peut se connecter après inscription | Supabase → *Authentication → Providers → Email* : désactivez *Confirm email*, ou configurez l'envoi d'e-mails (*SMTP*). |
| Les rappels ne partent pas | État du système → « Rappels WhatsApp automatiques » ; vérifiez `CRON_SECRET` et *Settings → Cron Jobs* dans Vercel. |
| Le site affiche des données fictives | Supprimez `NEXT_PUBLIC_DEMO` des variables Vercel, puis *Redeploy*. |
| Projet Supabase « Paused » | Offre gratuite inactive 7 jours : *Restore project* dans Supabase, ou passez à l'offre Pro. |
