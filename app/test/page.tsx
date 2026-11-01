"use client";

import { useEffect, useState } from "react";
import { RichText } from "@/components/chat/ChatParts";

interface TestCase {
  id: number;
  shopper_message: string;
  language: string;
  intent: string;
  expected_tool: string;
  should_hand_over: string;
  expected_answer_gist: string;
  verification_phone?: string;
}

interface Turn { user: string; reply: string }
interface Result {
  status: "running" | "pass" | "fail" | "error";
  turns: Turn[];
  tools: string[];
  handover: boolean;
  engine?: string;
  ms?: number;
  why?: string;
}

/**
 * Runs one test as a short conversation. If Vee asks for the registered phone
 * (order verification) or for a confirmation (e.g. "is it unused?"), the runner
 * answers like a real customer would, using the sample data.
 */
async function runTest(t: TestCase): Promise<Result> {
  const started = Date.now();
  const turns: Turn[] = [];
  const tools = new Set<string>();
  let handover = false;
  let conversationId: string | undefined;
  let engine: string | undefined;
  let message = t.shopper_message;

  for (let step = 0; step < 3; step++) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message, channel: "test" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    conversationId = data.conversationId;
    engine = data.engine;
    turns.push({ user: message, reply: data.message.content });
    (data.message.tools_used || []).forEach((x: string) => tools.add(x));
    handover ||= data.handover;

    if (data.awaiting === "phone" && t.verification_phone) message = t.verification_phone;
    else if (data.awaiting === "confirmation") message = "Yes, it's unused and the seal is intact.";
    else break;
  }

  const expectHandover = t.should_hand_over.toLowerCase() === "yes";
  const toolOk = tools.has(t.expected_tool);
  const handoverOk = handover === expectHandover;
  const why = [!toolOk && `expected tool “${t.expected_tool}”`, !handoverOk && `expected handover ${expectHandover ? "Yes" : "No"}`].filter(Boolean).join("; ");
  return { status: toolOk && handoverOk ? "pass" : "fail", turns, tools: [...tools], handover, engine, ms: Date.now() - started, why: why || undefined };
}

export default function TestPage() {
  const [tests, setTests] = useState<TestCase[]>([]);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [running, setRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/tests").then((r) => r.json()).then((d) => setTests(d.tests)).catch(() => setLoadError("Couldn't load test_questions.csv"));
  }, []);

  const runOne = async (t: TestCase) => {
    setResults((r) => ({ ...r, [t.id]: { status: "running", turns: [], tools: [], handover: false } }));
    try {
      const res = await runTest(t);
      setResults((r) => ({ ...r, [t.id]: res }));
    } catch (e) {
      setResults((r) => ({ ...r, [t.id]: { status: "error", turns: [], tools: [], handover: false, why: (e as Error).message } }));
    }
  };

  const runAll = async () => {
    setRunning(true);
    setResults({});
    // Restore sample orders so cancel/return tests are repeatable.
    await fetch("/api/reset?scope=orders", { method: "POST" });
    for (const t of tests) await runOne(t);
    setRunning(false);
  };

  const done = Object.values(results).filter((r) => r.status !== "running");
  const passed = done.filter((r) => r.status === "pass").length;
  const score = done.length ? Math.round((passed / done.length) * 100) : null;
  const engine = Object.values(results).find((r) => r.engine)?.engine;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-clay">Ringg Assist · QA</p>
          <h1 className="font-display text-3xl text-ink">Assistant test suite</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {tests.length} questions from <code>test_questions.csv</code>. A test passes when Vee uses the expected tool and the human-handover
            decision matches. Compare the reply with the expected gist yourself. Order tests answer the phone-verification step automatically.
          </p>
        </div>
        <button onClick={runAll} disabled={running || !tests.length} className="rounded-full bg-clay px-6 py-3 font-medium text-white hover:bg-clay-dark disabled:opacity-50">
          {running ? `Running… ${done.length}/${tests.length}` : "Run all"}
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Overall score" value={score === null ? "—" : `${score}%`} big />
        <Stat label="Passed" value={`${passed} / ${done.length || 0}`} />
        <Stat label="Failed" value={`${done.filter((r) => r.status !== "pass").length}`} />
        <Stat label="Engine" value={engine ? (engine === "gemini" ? "Gemini" : "Offline demo") : "—"} />
      </div>
      {running && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cream">
          <div className="h-full bg-clay transition-all" style={{ width: `${(done.length / Math.max(1, tests.length)) * 100}%` }} />
        </div>
      )}

      {loadError && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800">{loadError}</p>}

      <div className="mt-6 overflow-x-auto rounded-3xl border border-line">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-cream text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3 w-[22%]">Customer question</th>
              <th className="p-3 w-[32%]">Assistant response</th>
              <th className="p-3">Tool used</th>
              <th className="p-3">Handover</th>
              <th className="p-3 w-[20%]">Expected</th>
              <th className="p-3">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tests.map((t) => {
              const r = results[t.id];
              const last = r?.turns[r.turns.length - 1];
              return (
                <tr key={t.id} className="align-top">
                  <td className="p-3 text-muted">{t.id}</td>
                  <td className="p-3">
                    <p className="text-ink">{t.shopper_message}</p>
                    <p className="mt-1 text-[11px] text-muted">{t.language} · {t.intent}</p>
                  </td>
                  <td className="p-3 text-[13px] text-ink/90">
                    {r?.status === "running" && <span className="text-muted">Running…</span>}
                    {r?.status === "error" && <span className="text-red-700">Error: {r.why}</span>}
                    {last && (
                      <div>
                        <div className={expanded === t.id ? "" : "line-clamp-4"}><RichText text={last.reply} /></div>
                        {(r.turns.length > 1 || last.reply.length > 220) && (
                          <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} className="mt-1 text-[11px] text-clay-dark underline">
                            {expanded === t.id ? "Collapse" : r.turns.length > 1 ? `Show full ${r.turns.length}-turn conversation` : "Show more"}
                          </button>
                        )}
                        {expanded === t.id && r.turns.length > 1 && (
                          <div className="mt-2 space-y-2 rounded-xl bg-cream/60 p-2 text-[12px]">
                            {r.turns.map((tu, i) => (
                              <div key={i}><p className="text-muted">Customer: {tu.user}</p><div className="text-ink"><RichText text={tu.reply} /></div></div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {!r && <span className="text-muted">—</span>}
                  </td>
                  <td className="p-3">
                    {r?.tools.length ? r.tools.map((x) => (
                      <span key={x} className={`mb-1 mr-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${x === t.expected_tool ? "bg-sage/15 text-sage" : "bg-cream text-muted"}`}>{x}</span>
                    )) : <span className="text-muted">—</span>}
                  </td>
                  <td className="p-3">{r && r.status !== "running" ? (r.handover ? "Yes" : "No") : "—"}</td>
                  <td className="p-3 text-[12px]">
                    <p><span className="text-muted">Tool:</span> {t.expected_tool}</p>
                    <p><span className="text-muted">Handover:</span> {t.should_hand_over}</p>
                    <p className="mt-1 text-ink/80">{t.expected_answer_gist}</p>
                  </td>
                  <td className="p-3">
                    {r && r.status !== "running" ? (
                      <div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.status === "pass" ? "bg-sage/15 text-sage" : "bg-red-100 text-red-700"}`}>
                          {r.status === "pass" ? "PASS" : r.status === "error" ? "ERROR" : "FAIL"}
                        </span>
                        {r.why && r.status === "fail" && <p className="mt-1 text-[11px] text-red-700">{r.why}</p>}
                        {r.ms !== undefined && <p className="mt-1 text-[11px] text-muted">{(r.ms / 1000).toFixed(1)}s</p>}
                      </div>
                    ) : null}
                    <button onClick={() => runOne(t)} disabled={running || r?.status === "running"} className="mt-2 block text-[11px] text-clay-dark underline disabled:opacity-40">Run</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`rounded-3xl border p-5 ${big ? "border-clay bg-blush/40" : "border-line bg-white"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-display mt-1 text-ink ${big ? "text-4xl" : "text-2xl"}`}>{value}</p>
    </div>
  );
}
