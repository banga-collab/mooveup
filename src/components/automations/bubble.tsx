/** Aperçu sobre d'une bulle WhatsApp */
export function WhatsAppBubble({ text, time = "18:00" }: { text: string; time?: string }) {
  return (
    <div className="rounded-xl border border-line bg-[#efeae2] p-3">
      <div className="ml-auto max-w-[95%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] leading-relaxed text-[#111b21]">
        <p className="whitespace-pre-wrap break-words">{text}</p>
        <p className="mt-1 text-right text-[10.5px] text-[#667781]">{time}</p>
      </div>
    </div>
  );
}
