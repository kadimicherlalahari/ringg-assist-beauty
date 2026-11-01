"use client";

import { useCallback, useEffect, useState } from "react";
import type { Callback, ChatMessage, Customer, Order, Ticket } from "@/lib/types";
import type { Metrics } from "@/lib/metrics";
import { RichText } from "@/components/chat/ChatParts";

type CodOrder = Order & { customer?: Customer };
interface DashData { tickets: Ticket[]; callbacks: Callback[]; codOrders: CodOrder[]; metrics: Metrics }

const TABS = ["Tickets", "Callbacks", "COD confirmations", "Metrics"] as const;
type Tab = (typeof TABS)[number];

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("Tickets");
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(null);
    } catch {
      setError("Couldn't load dashboard data.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000); // live-ish refresh while demoing
    return () => clearInterval(t);
  }, [load]);

  const reset = async () => {
    if (!confirm("Reset all demo data? This clears conversations, tickets and callbacks and restores the sample orders.")) return;
    await fetch("/api/reset", { method: "POST" });
    try { localStorage.removeItem("vee-chat-v1"); } catch {}
    load();
  };

  const openTickets = data?.tickets.filter((t) => t.status === "Open").length ?? 0;
  const counts: Record<Tab, number | undefined> = {
    Tickets: openTickets,
    Callbacks: data?.callbacks.length,
    "COD confirmations": data?.codOrders.filter((o) => !o.call_status).length,
    Metrics: undefined,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-clay">Ringg Assist · Agent console</p>
          <h1 className="font-display text-3xl text-ink">Dashboard</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="rounded-full border border-line px-4 py-2 text-sm hover:border-clay">{refreshing ? "Refreshing…" : "Refresh"}</button>
          <button onClick={reset} className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:border-clay-dark hover:text-clay-dark">Reset demo data</button>
        </div>
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-full bg-cream p-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm ${tab === t ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
            {t}
            {counts[t] ? <span className="rounded-full bg-clay px-1.5 text-[11px] text-white">{counts[t]}</span> : null}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {!data && !error && <p className="mt-10 text-center text-muted">Loading…</p>}
      {data && (
        <div className="mt-6">
          {tab === "Tickets" && <TicketsTab tickets={data.tickets} onChange={load} />}
          {tab === "Callbacks" && <CallbacksTab callbacks={data.callbacks} />}
          {tab === "COD confirmations" && <CodTab orders={data.codOrders} onChange={load} />}
          {tab === "Metrics" && <MetricsTab m={data.metrics} />}
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-line p-10 text-center text-sm text-muted">{children}</div>;
}

function PriorityBadge({ p }: { p: Ticket["priority"] }) {
  const cls = p === "URGENT" ? "bg-red-600 text-white" : p === "High" ? "bg-saffron text-ink" : "bg-sand text-ink";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${cls}`}>{p}</span>;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function TicketsTab({ tickets, onChange }: { tickets: Ticket[]; onChange: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"Open" | "Resolved" | "All">("Open");
  const list = tickets
    .filter((t) => filter === "All" || t.status === filter)
    .sort((a, b) => (a.priority === "URGENT" ? -1 : 0) - (b.priority === "URGENT" ? -1 : 0) || b.created_at.localeCompare(a.created_at));
  const current = tickets.find((t) => t.id === selected) || list[0];

  if (!tickets.length) return <Empty>No tickets yet. Ask Vee for a human, report a reaction or a damaged item to create one.</Empty>;

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div>
        <div className="mb-3 flex gap-1 text-xs">
          {(["Open", "Resolved", "All"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 ${filter === f ? "bg-ink text-white" : "bg-cream text-muted"}`}>{f}</button>
          ))}
        </div>
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id}>
              <button onClick={() => setSelected(t.id)} className={`w-full rounded-2xl border p-3 text-left transition ${current?.id === t.id ? "border-clay bg-blush/40" : "border-line bg-white hover:border-clay/50"}`}>
                <div className="flex items-center gap-2">
                  <PriorityBadge p={t.priority} />
                  <span className="text-xs text-muted">{t.id}</span>
                  {t.status === "Resolved" && <span className="ml-auto text-[11px] text-sage">✓ Resolved</span>}
                </div>
                <p className="mt-1.5 text-sm font-medium capitalize text-ink">{t.reason.replace(/_/g, " ")}</p>
                <p className="line-clamp-2 text-xs text-muted">{t.summary}</p>
                <p className="mt-1 text-[11px] text-muted">{fmt(t.created_at)}{t.order_id ? ` · ${t.order_id}` : ""}</p>
              </button>
            </li>
          ))}
          {!list.length && <li className="text-sm text-muted">No {filter.toLowerCase()} tickets.</li>}
        </ul>
      </div>
      {current && <TicketDetail key={current.id} t={current} onChange={onChange} />}
    </div>
  );
}

function TicketDetail({ t, onChange }: { t: Ticket; onChange: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/conversations/${t.conversation_id}`).then((r) => r.json()).then((d) => setMessages(d.messages || [])).catch(() => setMessages([]));
  }, [t.conversation_id]);
  const resolve = async () => {
    setBusy(true);
    await fetch(`/api/tickets/${t.id}/resolve`, { method: "POST" });
    setBusy(false);
    onChange();
  };
  return (
    <div className="rounded-3xl border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
        <div>
          <div className="flex items-center gap-2"><PriorityBadge p={t.priority} /><span className="text-sm text-muted">{t.id}</span></div>
          <h2 className="font-display mt-1 text-2xl capitalize text-ink">{t.reason.replace(/_/g, " ")}</h2>
        </div>
        {t.status === "Open" ? (
          <button onClick={resolve} disabled={busy} className="rounded-full bg-sage px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{busy ? "Saving…" : "Mark resolved"}</button>
        ) : (
          <span className="rounded-full bg-sage/15 px-4 py-2 text-sm text-sage">Resolved {t.resolved_at ? fmt(t.resolved_at) : ""}</span>
        )}
      </div>
      <dl className="grid gap-4 border-b border-line p-5 text-sm sm:grid-cols-4">
        <Field label="Customer">{t.customer_name || "Not verified"}</Field>
        <Field label="Phone">{t.phone || "—"}</Field>
        <Field label="Order ID">{t.order_id || "—"}</Field>
        <Field label="Created">{fmt(t.created_at)}</Field>
        <div className="sm:col-span-4"><Field label="Issue summary">{t.summary}</Field></div>
        <div className="sm:col-span-4"><Field label="Promised to customer">{t.eta}</Field></div>
      </dl>
      <div className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted">Chat history</p>
        <div className="scrollbar-thin mt-3 max-h-[420px] space-y-2 overflow-y-auto rounded-2xl bg-cream/50 p-3">
          {messages === null && <p className="text-sm text-muted">Loading…</p>}
          {messages?.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${m.role === "user" ? "bg-ink text-white" : "bg-white text-ink"}`}>
                {m.role === "assistant" ? <RichText text={m.content} /> : m.content}
                {m.cards?.length ? <p className="mt-1 text-[11px] text-sage">Recommended: {m.cards.map((c) => c.name).join(", ")}</p> : null}
                <p className={`mt-1 text-[10px] ${m.role === "user" ? "text-white/60" : "text-muted"}`}>
                  {fmt(m.created_at)}{m.tools_used?.length ? ` · tools: ${m.tools_used.join(", ")}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

function CallbacksTab({ callbacks }: { callbacks: Callback[] }) {
  if (!callbacks.length) return <Empty>No callback requests yet. Use “Call me instead” in the Vee chat.</Empty>;
  return (
    <div className="overflow-x-auto rounded-3xl border border-line">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-cream text-xs uppercase tracking-wider text-muted">
          <tr><th className="p-3">Requested</th><th className="p-3">Phone</th><th className="p-3">Customer</th><th className="p-3">Conversation summary</th><th className="p-3">Status</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {callbacks.map((c) => (
            <tr key={c.id} className="align-top">
              <td className="p-3 text-muted">{fmt(c.created_at)}<br /><span className="text-[11px]">{c.id}</span></td>
              <td className="p-3 font-medium text-ink">{c.phone}</td>
              <td className="p-3">{c.customer_name || <span className="text-muted">Guest</span>}</td>
              <td className="p-3 text-ink/80">{c.summary}</td>
              <td className="p-3"><span className="rounded-full bg-sage/15 px-2 py-1 text-xs text-sage">{c.status}</span><br /><span className="text-[10px] text-muted">{c.provider_ref}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodTab({ orders, onChange }: { orders: CodOrder[]; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const trigger = async (id: string) => {
    setBusy(id);
    setErr(null);
    const res = await fetch(`/api/orders/${id}/ringg-call`, { method: "POST" });
    if (!res.ok) setErr("Couldn't queue the call. Please try again.");
    setBusy(null);
    onChange();
  };
  const groups = [
    { title: "Awaiting COD confirmation", desc: "Confirm order, address and delivery time before dispatch.", list: orders.filter((o) => o.status === "Pending COD confirmation") },
    { title: "Failed deliveries (NDR)", desc: "Confirm address, landmark and preferred time within 2 hours.", list: orders.filter((o) => o.status.includes("NDR")) },
  ];
  return (
    <div className="space-y-8">
      {err && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{err}</p>}
      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="font-display text-xl text-ink">{g.title}</h2>
          <p className="text-sm text-muted">{g.desc}</p>
          {g.list.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {g.list.map((o) => (
                <div key={o.order_id} className="rounded-3xl border border-line bg-white p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{o.order_id}</p>
                      <p className="text-sm text-muted">{o.customer?.name} · {o.customer?.phone} · {o.customer?.city}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs ${o.call_status ? "bg-sage/15 text-sage" : "bg-saffron/25 text-ink"}`}>{o.call_status || o.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-ink/80">{o.items.map((i) => i.name).join(", ")}</p>
                  <p className="mt-1 text-sm text-ink">COD total ₹{o.total_inr.toLocaleString("en-IN")} · Pref. language: {o.customer?.preferred_language}</p>
                  <p className="mt-1 text-xs text-muted">{o.status_note}</p>
                  <button
                    onClick={() => trigger(o.order_id)}
                    disabled={!!o.call_status || busy === o.order_id}
                    className="mt-4 rounded-full bg-clay px-4 py-2 text-sm font-medium text-white hover:bg-clay-dark disabled:bg-sand disabled:text-muted"
                  >
                    {busy === o.order_id ? "Queuing…" : o.call_status ? `✓ ${o.call_status}` : "Trigger Ringg Call"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3"><Empty>Nothing pending.</Empty></div>
          )}
        </section>
      ))}
    </div>
  );
}

function MetricsTab({ m }: { m: Metrics }) {
  const max = Math.max(1, ...m.byIntent.map((i) => i.count));
  const tiles = [
    ["Total conversations", m.totalConversations.toString()],
    ["Resolved without human", `${m.resolvedWithoutHumanPct}%`],
    ["Human handovers", m.humanHandovers.toString()],
    ["Products recommended", m.productsRecommended.toString()],
    ["Add-to-carts from chat", m.addToCartsFromChat.toString()],
    ["Avg. reply time", m.avgReplyMs ? `${(m.avgReplyMs / 1000).toFixed(m.avgReplyMs < 1000 ? 2 : 1)}s` : "—"],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-line bg-white p-5">
            <p className="text-xs text-muted">{label}</p>
            <p className="font-display mt-1 text-3xl text-ink">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-line bg-white p-5">
        <p className="font-display text-xl text-ink">Conversations by intent</p>
        <p className="text-xs text-muted">Primary intent of each customer conversation (test runs excluded)</p>
        {m.byIntent.length ? (
          <ul className="mt-4 space-y-2.5">
            {m.byIntent.map((i) => (
              <li key={i.intent} className="grid grid-cols-[150px_1fr_32px] items-center gap-3 text-sm">
                <span className="truncate text-ink">{i.intent}</span>
                <span className="h-5 rounded-full bg-cream">
                  <span className="block h-5 rounded-full bg-clay" style={{ width: `${(i.count / max) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-muted">{i.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No conversations yet.</p>
        )}
      </div>
    </div>
  );
}
