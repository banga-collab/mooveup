"use client";

import { createContext, startTransition, useActionState, useContext } from "react";
import { AlertCircle } from "lucide-react";

export type FormState = { error?: string } | undefined;

/** Indique aux boutons d'envoi qu'un envoi est en cours */
const PendingContext = createContext(false);
export const useActionPending = () => useContext(PendingContext);

/**
 * Formulaire relié à une Server Action qui renvoie { error } ou redirige.
 * Envoi manuel : si le serveur renvoie une erreur, les champs saisis sont conservés
 * (React vide sinon automatiquement le formulaire après chaque envoi).
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error && (
        <p role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
        </p>
      )}
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    </form>
  );
}
