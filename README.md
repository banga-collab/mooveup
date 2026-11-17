# Moov'Up CRM

CRM du groupe Moov'Up (Agadir) pour 7 établissements : **Moov'Up Sports, Lady Moov'Up, Moov'Up Kids, Power Gym, Anais Beauty Clinic, Anais Institut, Evolve Hommes**.
Le sélecteur en haut du menu passe de la vue groupe à un établissement. **Ctrl+K** (ou `/`) cherche un client, une page ou une action.

## Modules

| Domaine | Pages |
|---|---|
| Quotidien | Tableau de bord, Accueil & entrées (QR), Agenda, Clients (fiche 360°, dossier, fidélité, carte d'accès), Prospects, Tâches |
| Ventes | Caisse, Clôture de caisse (Z), Ventes & factures conformes (ICE, TVA), Abonnements, Fidélité & cartes cadeaux & parrainage, Catalogue, Stock (inventaire, fournisseurs, commandes) |
| Métiers | Dossiers clinique & institut (fiches techniques, consentements signés, photos avant/après), Kids (groupes, présences, parents), Planning équipe (pointage, commissions) |
| Pilotage | Rapports, Dépenses & marge, Campagnes, Rappels WhatsApp automatiques, Avis clients |
| Administration | Établissements, Équipe & droits, Journal des actions, Import Excel/CSV, Paramètres |
| Public | Réservation en ligne `/reserver?e=institut`, page d'avis `/r/<code>` |

Les photos ajoutées sont compressées automatiquement dans le navigateur (WebP, sans perte visible).

## Voir la démo (sans base de données)

```bash
npm run dev:demo
```

Comptes de démonstration (données fictives) :
- direction@moovup.ma / direction2026 : tous les établissements
- lady@moovup.ma / manager2026 : Lady Moov'Up et Kids
- accueil.anais@moovup.ma / accueil2026 : Anais Clinic et Anais Institut

## Mise en ligne

Guide pas à pas, en français simple : **[docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md)** (Supabase, Vercel, domaine, WhatsApp Business, CMI).

En bref :
1. Supabase (région **West EU (Paris)**) → **SQL Editor** → coller tout `supabase/000_tout.sql` → **Run**. Ce script unique crée tables, droits (RLS) et buckets ; il peut être relancé sans risque. Il est généré par `node scripts/build-sql.mjs` : à relancer quand un module ajoute un fichier `supabase/*.sql`.
2. Vercel → importer le projet, coller les variables ci-dessous (modèle : `.env.local.example`), **Deploy**, puis domaine `crm.moovup.ma`.
3. Créer le premier compte sur `/signup` : **il devient Direction**. La direction attribue ensuite rôle et établissements dans **Équipe & droits**.
4. Vérifier **Paramètres → État du système** (`/parametres/systeme`) : tout doit être vert (WhatsApp et CMI sont facultatifs).

Chaque membre ne voit que ses établissements ; les données médicales ne sont visibles que de la direction et des équipes clinique/institut (Row Level Security).

En local : copier `.env.local.example` en `.env.local`, le remplir, puis `npm run dev`.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Connexion à Supabase (obligatoires) |
| `SUPABASE_SERVICE_ROLE_KEY` | Réservation en ligne, avis, rappels et sauvegardes automatiques (serveur uniquement, secrète) |
| `CRON_SECRET` | Protège `/api/cron` et `/api/backup` (Vercel Cron l'envoie automatiquement) |
| `NEXT_PUBLIC_SITE_URL` | Adresse publique, ex. `https://crm.moovup.ma` (liens d'avis, réservation, retour CMI) |
| `WHATSAPP_TOKEN` | Token permanent WhatsApp Business (le *Phone number ID* se saisit dans Paramètres) ; sinon liens wa.me |
| `CMI_CLIENT_ID`, `CMI_STORE_KEY`, `CMI_GATEWAY_URL` | Acompte en ligne CMI (URL de rappel : `/api/cmi`) |
| `NEXT_PUBLIC_DEMO` | `1` = démo en mémoire. **Jamais en ligne.** |

### Tâches planifiées (`vercel.json`)

| Adresse | Fréquence | Rôle |
|---|---|---|
| `/api/cron` | toutes les heures | Rappels WhatsApp automatiques |
| `/api/backup` | chaque nuit (01:00 UTC) | Sauvegarde JSON complète dans le bucket privé `sauvegardes` (30 dernières conservées) |

L'offre gratuite de Vercel limite les tâches à une par jour : passer à Pro, ou appeler `/api/cron?secret=…` toutes les heures depuis cron-job.org.

### Sauvegardes

**Paramètres → Sauvegarde** (`/parametres/sauvegarde`, direction) : nombre de lignes par table, export CSV d'une table, export complet `moovup-sauvegarde-AAAA-MM-JJ.json` (généré en flux, sans les comptes de connexion), historique, et restauration d'un fichier (aperçu, double confirmation, fusion par identifiant).
