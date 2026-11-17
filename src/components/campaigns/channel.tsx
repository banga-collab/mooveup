import { CheckCheck, Mail, MessageCircle, MessageSquareText, type LucideProps } from "lucide-react";
import type { CampaignChannel, CampaignStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CHANNEL_META, STATUS_META } from "./shared";

export function ChannelIcon({ channel, ...props }: { channel: CampaignChannel } & LucideProps) {
  const I = channel === "whatsapp" ? MessageCircle : channel === "sms" ? MessageSquareText : Mail;
  return <I {...props} />;
}

/** Pastille carrée colorée du canal */
export function ChannelMark({ channel, size = 40 }: { channel: CampaignChannel; size?: number }) {
  const m = CHANNEL_META[channel];
  return (
    <span className="grid shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ width: size, height: size, background: m.color }} title={m.label}>
      <ChannelIcon channel={channel} style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.2} />
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: CampaignChannel }) {
  const m = CHANNEL_META[channel];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: m.soft, color: m.color }}>
      <ChannelIcon channel={channel} className="size-3.5" strokeWidth={2.4} />
      {m.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: CampaignStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: m.soft, color: m.color }}>
      <span className="size-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

/** Aperçu du message : bulle façon WhatsApp, SMS ou e-mail */
export function MessageBubble({ channel, text, sender, time = "10:30", className }: { channel: CampaignChannel; text: string; sender: string; time?: string; className?: string }) {
  if (channel === "email") {
    return (
      <div className={cn("rounded-2xl border border-line bg-white p-4 shadow-sm", className)}>
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <span className="grid size-8 place-items-center rounded-full bg-violet-100 text-violet-600">
            <Mail className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{sender}</p>
            <p className="text-[11px] text-muted">à vous · {time}</p>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{text || "Votre message apparaîtra ici…"}</p>
      </div>
    );
  }
  const wa = channel === "whatsapp";
  return (
    <div
      className={cn("rounded-2xl p-3 sm:p-4", className)}
      style={{
        background: wa ? "#efeae2" : "#f1f5f9",
        backgroundImage: wa ? "radial-gradient(#d9d2c5 1px, transparent 1px)" : undefined,
        backgroundSize: wa ? "14px 14px" : undefined,
      }}
    >
      <p className="mb-2 text-center">
        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{wa ? sender : `SMS · ${sender}`}</span>
      </p>
      <div
        className={cn("relative ml-auto w-fit max-w-[92%] rounded-2xl px-3 pb-1.5 pt-2 shadow-sm", wa ? "rounded-tr-sm" : "rounded-br-sm")}
        style={{ background: wa ? "#d9fdd3" : "#0284c7", color: wa ? "#111b21" : "#fff" }}
      >
        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-snug">{text || "Votre message apparaîtra ici…"}</p>
        <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10.5px]", wa ? "text-slate-500" : "text-white/75")}>
          {time}
          {wa && <CheckCheck className="size-3.5 text-sky-500" />}
        </p>
      </div>
    </div>
  );
}
