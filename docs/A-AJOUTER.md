# Moov'Up : ce qui reste à ajouter

Liste des manques et des améliorations possibles pour le **CRM général** (Moov'Up CRM) et le **CRM coaching** (Moov'Up Coach).
Cocher une case quand c'est fait.

> **Priorité conseillée** : commencer par la partie 1 (n° 1 à 3), puis le n° 7 (mettre le CRM coaching au niveau du CRM général), puis les « gains rapides » de la partie 4.

---

## 1. Fonctions manquantes

| # | Ce qui manque | Pourquoi c'est important | Fait |
|---|---|---|---|
| 1 | **Export des rapports** (Rapports, Pilotage, Analytique) en **PDF** et **Excel** | Aujourd'hui seules les listes s'exportent en CSV ; impossible de sortir un rapport mensuel pour la direction | ☐ |
| 2 | **« Mot de passe oublié »** à la connexion (les 2 CRM) | Un membre qui oublie son mot de passe est bloqué | ☐ |
| 3 | **Avoirs** : un remboursement crée seulement le statut « remboursée » | La comptabilité marocaine demande un document d'avoir numéroté | ☐ |
| 4 | **Lien entre les deux CRM** : un même client existe séparément dans le CRM général et le CRM coaching | Double saisie et chiffres qui divergent | ☐ |
| 5 | **Protection des données (CNDP, loi 09-08)** : consentement par client, export ou suppression de ses données sur demande | Obligation légale au Maroc | ☐ |
| 6 | **Envoi réel d'e-mails et de SMS** : facture par e-mail, réinitialisation de mot de passe, campagnes SMS | Le canal SMS existe dans les campagnes, mais aucun fournisseur n'est branché | ☐ |

## 2. Qualité inégale

| # | Ce qui manque | Fait |
|---|---|---|
| 7 | Le **CRM coaching** n'a pas reçu les améliorations UX du CRM général : design minimaliste, recherche Ctrl+K, mode sombre, arabe, « Annuler », aperçu rapide, recherche et filtres sur les listes | ☐ |
| 8 | L'**arabe** ne couvre que les menus, la tablette et l'espace adhérent : les pages métier restent en français | ☐ |
| 9 | Les **calculs lourds** (rapports, pilotage) sont faits dans l'application et non dans la base : lent avec beaucoup d'années de données | ☐ |

## 3. Pas encore vérifié

| # | Ce qui reste | Fait |
|---|---|---|
| 10 | **La vraie version avec Supabase** n'a pas été testée : tout a été validé en démo uniquement (d'où les « fetch failed » sur les projets Vercel non démo) | ☐ |
| 11 | **Envoi WhatsApp réel** et **paiement CMI** : nécessitent les clés (compte Meta Business, contrat CMI) | ☐ |
| 12 | **Tests automatiques** : aucun pour l'instant, chaque modification doit être retestée à la main | ☐ |
| 13 | À tester à la main : glisser-déposer dans l'agenda, RDV récurrents, génération des factures entreprises | ☐ |

---

## 4. Améliorations possibles

### Argent & paiements
- [ ] **Codes promo et coupons** en caisse (ex. « RAMADAN20 », offres limitées) *(gain rapide)*
- [ ] **Échéanciers** : un abonnement annuel de 3 600 MAD payé en 3 fois, avec relances automatiques à chaque échéance *(gain rapide)*
- [ ] **Paiement récurrent automatique** des abonnements mensuels
- [ ] **Export comptable** (format type Sage) et préparation de la déclaration de TVA
- [ ] **Export paie** : heures travaillées et commissions prêtes pour le comptable

### Accueil & matériel
- [ ] **Branchement du matériel** : imprimante à tickets, tiroir-caisse, TPE, lecteur de badges / **tourniquet** qui s'ouvre automatiquement quand l'accès est autorisé
- [ ] **Réservation des ressources** : terrain de foot, lignes de piscine, cabines, salles, avec leur propre planning *(gain rapide)*
- [ ] **Affluence en direct** visible par les adhérents (« la salle est calme maintenant »)
- [ ] **Écran TV en salle** : cours du jour, classement des défis, annonces

### Adhérents & fidélité
- [ ] **Contrat d'adhésion et règlement intérieur** signés à l'écran à l'inscription *(gain rapide)*
- [ ] **Notifications push** sur téléphone (rappel, offre, cours annulé) *(gain rapide)*
- [ ] **Événements et billetterie** : tournois, anniversaires Kids, ateliers, avec paiement en ligne
- [ ] **Réclamations / SAV** : enregistrer un problème, suivi, résolution
- [ ] **Assistant IA dans le CRM général** : résumé d'un client en 3 lignes, rédaction des messages WhatsApp

### Sécurité & équipe
- [ ] **Connexion en deux étapes** (code par SMS ou application) pour la direction
- [ ] **Permissions sur mesure** : ex. une réceptionniste qui peut rembourser mais pas faire de remise
- [ ] **Synchronisation agenda** de l'équipe (Google Agenda, Outlook)

### Croissance
- [ ] **API ouverte et webhooks** pour brancher d'autres outils
- [ ] **Application mobile native** sur l'App Store et Google Play (aujourd'hui : application web installable)
- [ ] **Multi-sites prêt** : si un nouveau Moov'Up ouvre, l'ajouter en quelques clics

---

## Liens utiles

| | Démo en ligne | Code |
|---|---|---|
| CRM général | https://mooveup-p7vw.vercel.app (direction@moovup.ma / direction2026) | `Documents\MoovUp-CRM` · github.com/banga-collab/mooveup |
| CRM coaching | https://coaching-nine-kohl.vercel.app (admin@moovup.ma / moovup2026) | `Documents\MoovUp-Coach` · github.com/banga-collab/Coaching |

Documents existants : `docs/MISE-EN-LIGNE.md`, `docs/Presentation-MoovUp-CRM.pdf`, `docs/Flux-de-donnees-MoovUp.pdf` (CRM général) et `docs/Presentation-MoovUp-Coach.pdf` (CRM coaching).
