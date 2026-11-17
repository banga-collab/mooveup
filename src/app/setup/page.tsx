import Image from "next/image";
import { Database, KeyRound, Terminal } from "lucide-react";

export const metadata = { title: "Configuration" };

export default function SetupPage() {
  const steps = [
    { icon: Database, title: "Crée un projet Supabase", text: "Sur supabase.com, crée un projet (région Europe recommandée)." },
    { icon: Terminal, title: "Crée les tables", text: "Dans SQL Editor, colle le contenu de supabase/schema.sql puis clique sur Run." },
    { icon: KeyRound, title: "Ajoute les clés", text: "Copie .env.local.example en .env.local et remplis l'URL et la clé anon (Project Settings › API). Redémarre ensuite le serveur." },
  ];
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5 py-12">
      <div className="w-full max-w-lg animate-fade-up rounded-3xl border border-line bg-white p-8 shadow-pop">
        <Image src="/logo.png" alt="Complexe Moov'Up Sports" width={473} height={136} className="mx-auto h-auto w-48" />
        <h1 className="mt-8 text-center font-display text-2xl font-extrabold">Encore une étape</h1>
        <p className="mt-1 text-center text-sm text-muted">L&apos;application n&apos;est pas encore reliée à sa base de données.</p>
        <ol className="mt-8 space-y-5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-500">
                <s.icon className="size-5" />
              </span>
              <div>
                <p className="font-semibold">
                  <span className="text-accent-500">{i + 1}.</span> {s.title}
                </p>
                <p className="mt-0.5 text-sm text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-8 rounded-xl bg-accent-50 px-4 py-3 text-sm text-accent-700">
          Le premier compte créé devient automatiquement <b>administrateur</b>.
        </p>
      </div>
    </main>
  );
}
