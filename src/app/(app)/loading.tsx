/** Squelette affiché pendant le chargement d'une page */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Chargement">
      <div className="h-7 w-56 rounded-md bg-slate-200/70" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[92px] rounded-xl border border-line bg-white" />
        ))}
      </div>
      <div className="h-80 rounded-xl border border-line bg-white" />
    </div>
  );
}
