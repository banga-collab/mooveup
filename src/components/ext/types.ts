import type { Scope } from "@/lib/auth";
import type { Contact, Profile } from "@/lib/types";

/** Propriétés communes des onglets ajoutés à la fiche client */
export type ContactTabProps = { contact: Contact; scope: Scope; me: Profile };
