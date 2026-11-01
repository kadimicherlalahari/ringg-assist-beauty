import { NextResponse } from "next/server";
import { addMessage, getOrCreateConversation, saveConversation } from "@/lib/agent";
import { newTurn, saveCallback } from "@/lib/agent/tools";

export const dynamic = "force-dynamic";

/** "Call me instead": saves the callback + summary and simulates the Ringg call. */
export async function POST(req: Request) {
  const { conversationId, phone } = await req.json();
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 12)
    return NextResponse.json({ error: "Please enter a valid 10-digit mobile number." }, { status: 400 });
  const normalized = `+91 ${digits.slice(-10, -5)} ${digits.slice(-5)}`;

  const conv = await getOrCreateConversation(conversationId);
  if (!conv.intents.includes("voice_request")) conv.intents.push("voice_request");
  const ctx = newTurn(conv);
  const cb = await saveCallback(ctx, normalized);
  await saveConversation(conv);
  const message = await addMessage({
    conversation_id: conv.id,
    role: "assistant",
    content:
      conv.language === "hinglish" || conv.language === "hi"
        ? `Ho gaya! Hamara voice assistant **${normalized}** par jaldi call karega. Maine chat ka summary bhi bhej diya hai, aapko kuch dobara batana nahi padega.`
        : `You're all set! Our voice assistant will call you on **${normalized}** shortly. I've shared a summary of our chat so you won't need to repeat anything.`,
    actions: ctx.actions,
    tools_used: ["request_callback"],
    intent: "voice_request",
    engine: "system",
  });
  return NextResponse.json({ conversationId: conv.id, callback: cb, message });
}
