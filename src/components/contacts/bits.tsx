import type { ContactStatus } from "@/lib/types";
import { CONTACT_STATUS_LABEL, cn, waLink } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { STATUS_TONE } from "./helpers";

export function StatusBadge({ status }: { status: ContactStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {CONTACT_STATUS_LABEL[status]}
    </Badge>
  );
}

/** Icône WhatsApp (pictogramme simple) */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.3-1.95 1.34-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.93-4.66-4.11-.13-.18-1.11-1.48-1.11-2.83 0-1.34.7-2 .95-2.28.25-.27.54-.34.72-.34h.52c.16 0 .39-.06.6.46.23.54.77 1.88.84 2.02.07.14.11.29.02.47-.09.18-.14.29-.27.45-.14.16-.29.35-.41.47-.14.14-.28.28-.12.56.16.27.71 1.17 1.52 1.89 1.04.93 1.92 1.22 2.2 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.33Z" />
    </svg>
  );
}

export function WhatsAppButton({ phone, text, className, label }: { phone: string | null; text?: string; className?: string; label?: string }) {
  const href = waLink(phone, text);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Écrire sur WhatsApp"
      aria-label={label ? undefined : "Écrire sur WhatsApp"}
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[13px] font-medium text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
        !label && "w-9 px-0",
        className,
      )}
    >
      <WhatsAppIcon className="size-4 text-emerald-600" />
      {label}
    </a>
  );
}

export function TagChip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{children}</span>;
}
