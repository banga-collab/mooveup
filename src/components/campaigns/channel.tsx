import { CheckCheck, Mail, MessageCircle, MessageSquareText, type LucideProps } from "lucide-react";
import type { CampaignChannel, CampaignStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { CHANNEL_META, STATUS_META } from "./shared";

export function ChannelIcon({ channel, ...props }: { channel: CampaignChannel } & LucideProps) {
  const I = channel === "whatsapp" ? MessageCircle : channel === "sms" ? MessageSquareText : Mail;
  return <I {...props} />;
}

/** Pastille discrète du canal : fond teinté, icône colorée */
export function ChannelMark({ channel, size = 36 }: { channel: CampaignChannel; size?: number }) {
  const m = CHANNEL_META[channel];
  return (
    <span className="grid shrink-0 place-items-center rounded-lg" style={{ width: size, height: size, background: m.soft, color: m.color }} title={m.label}>
      <ChannelIcon channel={channel} style={{ width: size * 0.47, height: size * 0.47 }} strokeWidth={2} aria-hidden />
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: CampaignChannel }) {
  const m = CHANNEL_META[channel];
  return (
    <Badge tone="gray">
      <ChannelIcon channel={channel} className="size-3.5" style={{ color: m.color }} aria-hidden />
      {m.label}
    </Badge>
  );
}

const STATUS_TONE: Record<CampaignStatus, "gray" | "amber" | "green"> = { brouillon: "gray", programmee: "amber", envoyee: "green" };

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {STATUS_META[status].label}
    </Badge>
  );
}

/** Aperçu du message : bulle façon WhatsApp, SMS ou e-mail */
export function MessageBubble({ channel, text, sender, time = "10:30", className }: { channel: CampaignChannel; text: string; sender: string; time?: string; className?: string }) {
  if (channel === "email") {
    return (
      <div className={cn("rounded-lg border border-line bg-white p-4", className)}>
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-slate-500">
            <Mail className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{sender}</p>
            <p className="text-xs text-muted">à vous · {time}</p>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{text || "Votre message apparaîtra ici…"}</p>
      </div>
    );
  }
  const wa = channel === "whatsapp";
  return (
    <div className={cn("rounded-lg p-3 sm:p-4", wa ? "bg-[#efeae2]" : "bg-slate-100", className)}>
      <p className="mb-2 text-center">
        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-500">{wa ? sender : `SMS · ${sender}`}</span>
      </p>
      <div
        className={cn("relative ml-auto w-fit max-w-[92%] rounded-xl px-3 pb-1.5 pt-2", wa ? "rounded-tr-sm" : "rounded-br-sm")}
        style={{ background: wa ? "#d9fdd3" : "#0369a1", color: wa ? "#111b21" : "#fff" }}
      >
        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-snug">{text || "Votre message apparaîtra ici…"}</p>
        <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[11px]", wa ? "text-slate-500" : "text-white/80")}>
          {time}
          {wa && <CheckCheck className="size-3.5 text-sky-600" />}
        </p>
      </div>
    </div>
  );
}
