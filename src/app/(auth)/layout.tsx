import Image from "next/image";
import { Building2, Filter, LineChart } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Panneau de marque */}
      <aside className="relative hidden overflow-hidden bg-brand-700 lg:flex lg:flex-col lg:justify-between p-12 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(232,120,42,.35),transparent_45%),radial-gradient(circle_at_90%_90%,rgba(63,143,174,.6),transparent_50%)]" />
        <Pixels />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20 backdrop-blur">
            <span className="size-1.5 rounded-full bg-accent-400" /> Groupe Moov&apos;Up · Agadir
          </span>
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight">
            Un seul CRM.
            <br />
            <span className="text-accent-400">Sept établissements.</span>
          </h2>
          <p className="mt-4 text-brand-100/90">Moov&apos;Up Sports, Lady, Kids, Power Gym, Anais Clinic, Anais Institut et Evolve Hommes : clients, ventes et rendez-vous au même endroit.</p>
          <ul className="mt-10 space-y-4 text-sm">
            {[
              [Building2, "Vue groupe ou par établissement"],
              [Filter, "Prospects, relances et campagnes WhatsApp"],
              [LineChart, "Caisse, abonnements et chiffre d'affaires"],
            ].map(([Icon, label], i) => {
              const I = Icon as typeof Building2;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                    <I className="size-4 text-accent-300" />
                  </span>
                  {label as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200/70">© {new Date().getFullYear()} Groupe Moov&apos;Up</p>
      </aside>

      {/* Formulaire */}
      <main className="flex flex-col items-center justify-center bg-white px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px] animate-fade-up">
          <Image src="/logo.png" alt="Complexe Moov'Up Sports" width={473} height={136} priority className="mx-auto mb-10 h-auto w-56" />
          {children}
        </div>
      </main>
    </div>
  );
}

/** Motif de carrés inspiré du logo */
function Pixels() {
  const cells = Array.from({ length: 46 }, (_, i) => {
    const x = (i * 53) % 100;
    const y = (i * 37) % 100;
    const s = 6 + ((i * 7) % 14);
    const c = i % 5 === 0 ? "#e8782a" : i % 3 === 0 ? "#3f8fae" : "rgba(255,255,255,.18)";
    return <rect key={i} x={`${x}%`} y={`${y}%`} width={s} height={s} fill={c} opacity={0.55} transform={`rotate(${(i * 13) % 30})`} />;
  });
  return (
    <svg className="absolute inset-y-0 right-0 h-full w-2/3 opacity-60 [mask-image:linear-gradient(to_left,black,transparent)]" aria-hidden>
      {cells}
    </svg>
  );
}
