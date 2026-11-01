"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ChatAction, ChatMessage } from "@/lib/types";
import { ActionBlock, CallbackForm, ChatProductCard, RichText } from "./ChatParts";

type UIMessage = Pick<ChatMessage, "id" | "role" | "content" | "cards" | "actions"> & { local?: boolean };

const STORE_KEY = "vee-chat-v1";
const MENU = ["Find products for my skin", "Track my order", "Return or cancel", "Talk to a person"];

function greeting(productName?: string): UIMessage {
  return {
    id: "greeting",
    role: "assistant",
    local: true,
    content: productName
      ? `Hi, I'm **Vee** from Velora Botanicals 🌿 I see you're looking at the **${productName}**. Ask me anything about it, or pick an option below. I can reply in English, Hindi or Hinglish.`
      : "Hi, I'm **Vee** from Velora Botanicals 🌿 I can help you find the right products, track or cancel orders, and set up returns. I can reply in English, Hindi or Hinglish.",
    actions: [{ type: "quick_replies", options: MENU }],
  };
}

export function ChatWidget({ products }: { products: { id: string; name: string }[] }) {
  const pathname = usePathname();
  const productId = pathname?.match(/^\/products\/(vb-\d{3})/i)?.[1]?.toUpperCase();
  const productName = products.find((p) => p.id === productId)?.name;

  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const [showCallback, setShowCallback] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore the conversation from browser storage.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved?.conversationId) {
        setConversationId(saved.conversationId);
        setMessages(saved.messages || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ conversationId, messages: messages.slice(-60) })); } catch {}
  }, [conversationId, messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, showCallback, open]);

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: msg, local: true }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: msg, productId, page: pathname }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setConversationId(data.conversationId);
      setEngine(data.engine);
      setMessages((m) => [...m, data.message]);
      setLastFailed(null);
    } catch (e) {
      setError((e as Error).message === "Failed to fetch" ? "You seem to be offline. Check your connection." : "Vee couldn't reply just now.");
      setLastFailed(msg);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [conversationId, loading, pathname, productId]);

  const requestCallback = useCallback(async (phone: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, phone }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || "Couldn't save your request. Please try again.";
      setConversationId(data.conversationId);
      setShowCallback(false);
      setMessages((m) => [...m, data.message]);
      return null;
    } catch {
      return "Network error. Please try again.";
    }
  }, [conversationId]);

  // Open from anywhere: window.dispatchEvent(new CustomEvent("vee:open", { detail: { message } }))
  useEffect(() => {
    const handler = (e: Event) => {
      setOpen(true);
      const message = (e as CustomEvent).detail?.message as string | undefined;
      if (message) setTimeout(() => send(message), 150);
    };
    window.addEventListener("vee:open", handler);
    return () => window.removeEventListener("vee:open", handler);
  }, [send]);

  const newChat = () => {
    setConversationId(undefined);
    setMessages([]);
    setError(null);
    setShowCallback(false);
    try { localStorage.removeItem(STORE_KEY); } catch {}
  };

  const all: UIMessage[] = [greeting(productName), ...messages];
  // Only the most recent callback form stays interactive.
  const lastFormIdx = all.map((m) => m.actions?.some((a) => a.type === "callback_form")).lastIndexOf(true);

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Chat with Vee"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-clay py-3 pl-3 pr-5 text-white shadow-[0_12px_30px_-10px_rgba(158,79,43,0.7)] transition hover:bg-clay-dark"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 font-display text-lg">V</span>
          <span className="text-sm font-medium">Chat with Vee</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white animate-pop sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[640px] sm:max-h-[calc(100vh-40px)] sm:w-[400px] sm:rounded-[28px] sm:border sm:border-line sm:shadow-[0_30px_70px_-20px_rgba(80,40,20,0.35)]">
          <header className="flex items-center gap-3 border-b border-line bg-gradient-to-r from-blush to-cream px-4 py-3 sm:rounded-t-[28px]">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-clay font-display text-lg text-white">V</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[17px] leading-tight text-ink">Vee</p>
              <p className="truncate text-[11px] text-muted">
                Velora Botanicals assistant
                {engine && engine !== "gemini" ? " · demo mode" : ""}
              </p>
            </div>
            <button onClick={newChat} className="rounded-full px-2.5 py-1 text-[11px] text-muted hover:bg-white" title="Start a new conversation">New chat</button>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="grid h-8 w-8 place-items-center rounded-full text-xl text-muted hover:bg-white">×</button>
          </header>

          {productName && (
            <div className="border-b border-line bg-cream/60 px-4 py-1.5 text-[11px] text-muted">
              Viewing: <span className="text-ink">{productName}</span>
            </div>
          )}

          <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-3 py-4">
            {all.map((m, idx) => (
              <div key={m.id} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[88%] rounded-3xl px-4 py-2.5 text-[13.5px] leading-relaxed ${m.role === "user" ? "rounded-br-lg bg-ink text-white" : "rounded-bl-lg bg-cream text-ink"}`}>
                  {m.role === "assistant" ? <RichText text={m.content} /> : m.content}
                </div>
                {m.cards && m.cards.length > 0 && (
                  <div className="flex w-[92%] flex-col gap-2">
                    {m.cards.map((c) => <ChatProductCard key={c.product_id} card={c} conversationId={conversationId} />)}
                  </div>
                )}
                {m.actions?.filter((a: ChatAction) => !(a.type === "callback_form" && idx !== lastFormIdx)).map((a, i) => (
                  <div key={i} className="w-[92%]">
                    <ActionBlock action={a} onQuickReply={send} onCallback={requestCallback} />
                  </div>
                ))}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-1 rounded-3xl rounded-bl-lg bg-cream px-4 py-3 w-fit" aria-label="Vee is typing">
                {[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-clay" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </div>
            )}
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                {error}{" "}
                {lastFailed && <button onClick={() => { setMessages((m) => m.slice(0, -1)); send(lastFailed); }} className="font-semibold underline">Retry</button>}
              </div>
            )}
            {showCallback && <CallbackForm onSubmit={requestCallback} compact />}
          </div>

          <div className="border-t border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <button onClick={() => setShowCallback((s) => !s)} className="rounded-full border border-line px-3 py-1 text-[12px] text-ink hover:border-clay">
                📞 Call me instead
              </button>
              <span className="text-[10px] text-muted">English · हिंदी · Hinglish</span>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex items-end gap-2 rounded-3xl border border-line bg-white px-3 py-2 focus-within:border-clay"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder={productName ? "Ask about this product…" : "Type your message…"}
                aria-label="Message Vee"
                className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm outline-none"
              />
              <button type="submit" disabled={!input.trim() || loading} className="rounded-full bg-clay px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
