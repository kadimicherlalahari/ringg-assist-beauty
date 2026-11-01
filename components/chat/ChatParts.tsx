"use client";

// Presentational pieces of the Vee chat: message text, product cards, action blocks.

import Link from "next/link";
import { useState } from "react";
import type { ChatAction, ProductCard } from "@/lib/types";
import { ProductImage } from "../ProductImage";
import { AddToCartButton } from "../StoreUI";

/** Tiny Markdown subset: **bold**, *italic*, "-"/"*" bullets, "1." lists, line breaks. */
const LIST_RX = /^\s*([-*•]|\d+\.)\s+/;
export function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => LIST_RX.test(l));
        if (isList) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={bi} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-4`}>
              {lines.map((l, li) => <li key={li}>{inline(l.replace(LIST_RX, ""))}</li>)}
            </Tag>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {LIST_RX.test(l) ? <span className="block pl-2">• {inline(l.replace(LIST_RX, ""))}</span> : inline(l)}
                {li < lines.length - 1 && !LIST_RX.test(l) && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    : part.length > 2 && part.startsWith("*") && part.endsWith("*") ? <em key={i}>{part.slice(1, -1)}</em>
    : <span key={i}>{part}</span>,
  );
}

export function ChatProductCard({ card, conversationId }: { card: ProductCard; conversationId?: string }) {
  return (
    <div className="flex w-full gap-3 rounded-2xl border border-line bg-white p-2.5">
      <Link href={card.product_url} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl">
        <ProductImage id={card.product_id} category={card.category} name={card.name} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={card.product_url} className="line-clamp-2 text-[13px] font-medium leading-snug text-ink hover:text-clay-dark">{card.name}</Link>
        {card.reason && <p className="line-clamp-1 text-[11px] text-sage">{card.reason}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <p className="text-sm">
            <span className="font-semibold text-ink">₹{card.price_inr}</span>{" "}
            <span className="text-[11px] text-muted line-through">₹{card.mrp_inr}</span>
          </p>
          <AddToCartButton product={card} size="sm" source="chat" conversationId={conversationId} disabled={!card.in_stock} />
        </div>
      </div>
    </div>
  );
}

export function CallbackForm({ onSubmit, compact }: { onSubmit: (phone: string) => Promise<string | null>; compact?: boolean }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done) return null;
  const submit = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return setErr("Please enter a valid 10-digit mobile number.");
    setBusy(true);
    setErr(null);
    const e = await onSubmit(phone);
    setBusy(false);
    if (e) setErr(e); else setDone(true);
  };
  return (
    <div className={`rounded-2xl border border-clay/30 bg-blush/50 ${compact ? "p-3" : "p-3.5"}`}>
      <p className="text-[13px] font-medium text-ink">📞 Get a call from our voice assistant</p>
      <p className="mt-0.5 text-[11px] text-muted">We&apos;ll share a summary of this chat so you don&apos;t have to repeat anything.</p>
      <div className="mt-2 flex gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-full border border-line bg-white px-3 focus-within:border-clay">
          <span className="text-sm text-muted">+91</span>
          <input
            inputMode="tel"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="98450 11201"
            aria-label="Phone number"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none"
          />
        </div>
        <button onClick={submit} disabled={busy} className="rounded-full bg-clay px-4 text-sm font-medium text-white hover:bg-clay-dark disabled:opacity-60">
          {busy ? "Saving…" : "Call me"}
        </button>
      </div>
      {err && <p className="mt-1.5 text-[11px] text-clay-dark">{err}</p>}
    </div>
  );
}

export function ActionBlock({ action, onQuickReply, onCallback }: { action: ChatAction; onQuickReply: (t: string) => void; onCallback: (phone: string) => Promise<string | null> }) {
  switch (action.type) {
    case "quick_replies":
      return (
        <div className="flex flex-wrap gap-1.5">
          {action.options.map((o) => (
            <button key={o} onClick={() => onQuickReply(o)} className="rounded-full border border-clay/40 bg-white px-3 py-1.5 text-xs text-clay-dark hover:bg-blush">
              {o}
            </button>
          ))}
        </div>
      );
    case "callback_form":
      return <CallbackForm onSubmit={onCallback} />;
    case "callback_confirmed":
      return (
        <div className="rounded-2xl border border-sage/30 bg-sage/10 p-3 text-[12px] text-ink">
          ✓ Callback requested for <b>{action.phone}</b> · Ref {action.callback_id}
        </div>
      );
    case "ticket":
      return (
        <div className={`rounded-2xl border p-3 text-[12px] ${action.priority === "URGENT" ? "border-red-200 bg-red-50" : "border-line bg-cream"}`}>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${action.priority === "URGENT" ? "bg-red-600 text-white" : action.priority === "High" ? "bg-saffron text-ink" : "bg-sand text-ink"}`}>
              {action.priority}
            </span>
            <span className="font-medium text-ink">Handed to a human · {action.ticket_id}</span>
          </div>
          <p className="mt-1 text-muted">{action.eta}</p>
        </div>
      );
    case "order":
      return (
        <div className="rounded-2xl border border-line bg-white p-3 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink">Order {action.order_id}</span>
            <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] text-clay-dark">{action.status}</span>
          </div>
          {action.expected_delivery && <p className="mt-1 text-muted">Expected: {new Date(action.expected_delivery + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}</p>}
          <p className="mt-0.5 text-muted">{action.note}</p>
        </div>
      );
  }
}
