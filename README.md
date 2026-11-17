# Moov'Up CRM

CRM du groupe Moov'Up (Agadir) pour 7 établissements : **Moov'Up Sports, Lady Moov'Up, Moov'Up Kids, Power Gym, Anais Beauty Clinic, Anais Institut, Evolve Hommes**.
Un sélecteur en haut du menu passe de la vue groupe à un établissement.

## Modules

| Domaine | Pages |
|---|---|
| Clients | Clients & contacts (fiche 360°, historique, WhatsApp), Prospects (pipeline), Tâches |
| Ventes | Caisse, Ventes & factures (ticket imprimable, export CSV), Abonnements & packs, Catalogue |
| Rendez-vous | Agenda par praticien (clinique, institut, barbier, coaching, terrains) |
| Pilotage | Tableau de bord, Campagnes WhatsApp/SMS/e-mail, Rapports, Établissements, Équipe |

## Voir la démo (sans base de données)

```bash
npm run dev:demo
```

Comptes de démonstration (données fictives) :
- direction@moovup.ma / direction2026 : tous les établissements
- lady@moovup.ma / manager2026 : Lady Moov'Up et Kids
- accueil.anais@moovup.ma / accueil2026 : Anais Clinic et Anais Institut

## Mise en route avec Supabase

1. Crée un projet sur supabase.com, puis colle `supabase/schema.sql` dans **SQL Editor** et clique sur **Run**.
2. Copie `.env.local.example` en `.env.local` et remplis l'URL et la clé `anon`.
3. Lance `npm run dev`, puis crée un compte : **le premier compte devient Direction**. La direction attribue ensuite rôle et établissements aux autres membres dans **Équipe**.

Chaque membre ne voit que les établissements qui lui sont attribués : la base l'impose avec le Row Level Security.
