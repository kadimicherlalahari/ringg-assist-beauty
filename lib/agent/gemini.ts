// Gemini engine: manual function-calling loop over the tools in tools.ts.
// Enabled when GEMINI_API_KEY is set (see .env.example).

import { GoogleGenAI, FinishReason, ThinkingLevel, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import { TOOL_DEFINITIONS, executeTool, type TurnContext } from "./tools";
import { TODAY } from "../business-rules";
import { seed, readPolicies } from "../db";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_TOOL_ROUNDS = 8;

let client: GoogleGenAI | null = null;

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

const FUNCTION_DECLARATIONS: FunctionDeclaration[] = TOOL_DEFINITIONS.map((t) => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: t.input_schema,
}));

/** System instruction = editable prompt file + reference data. */
function systemInstruction(): string {
  const promptFile = path.join(process.cwd(), "prompts", "vee-system-prompt.md");
  const base = fs.readFileSync(promptFile, "utf8").replaceAll("{{TODAY}}", TODAY);
  return [
    base,
    "\n---\n# Reference: store policies\n",
    readPolicies(),
    "\n# Reference: FAQ\n",
    seed.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n"),
  ].join("\n");
}

/**
 * Free-tier keys are rate limited (e.g. 15 requests/minute). On a 429 we wait for
 * the delay Google suggests (if short) and retry once; otherwise the orchestrator
 * falls back to the offline engine.
 */
async function generate(params: Parameters<GoogleGenAI["models"]["generateContent"]>[0]) {
  try {
    return await getClient().models.generateContent(params);
  } catch (err) {
    const status = (err as { status?: number }).status;
    const delay = Number(String((err as Error).message).match(/"retryDelay":"(\d+)s"/)?.[1] ?? NaN);
    if (status !== 429 || !(delay <= 12)) throw err;
    await new Promise((r) => setTimeout(r, (delay + 1) * 1000));
    return getClient().models.generateContent(params);
  }
}

const BLOCKED = new Set<string>([FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST, FinishReason.SPII]);

export async function runGemini(ctx: TurnContext, userText: string, contextLine: string): Promise<string> {
  const conv = ctx.conversation;
  const contents: Content[] = [
    ...((conv.llm_history as Content[] | undefined) || []),
    { role: "user", parts: [{ text: contextLine ? `${contextLine}\n\n${userText}` : userText }] },
  ];

  let finalText = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await generate({
      model: MODEL,
      contents,
      config: {
        systemInstruction: systemInstruction(),
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        // Chat needs snappy replies.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content || BLOCKED.has(candidate.finishReason || "")) {
      finalText = "Sorry, I can't help with that here. I can connect you with our support team if you'd like.";
      break;
    }
    // Append the model turn unchanged so thought signatures are preserved.
    contents.push(candidate.content);

    const parts = candidate.content.parts || [];
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
    if (text) finalText = text;

    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (!calls.length) break;

    const results: Part[] = [];
    for (const call of calls) {
      const name = call.name || "";
      try {
        const output = await executeTool(name, (call.args || {}) as Record<string, unknown>, ctx);
        results.push({ functionResponse: { id: call.id, name, response: { output } } });
      } catch (e) {
        results.push({ functionResponse: { id: call.id, name, response: { error: (e as Error).message } } });
      }
    }
    contents.push({ role: "user", parts: results });
  }

  conv.llm_history = contents;
  return finalText || "Sorry, I didn't catch that. Could you rephrase?";
}
