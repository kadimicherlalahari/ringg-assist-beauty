import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Full chat history for a conversation (dashboard ticket view). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [conversation, messages] = await Promise.all([db.get("conversations", id), db.list("messages", ["conversation_id", id])]);
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { llm_history: _omit, ...rest } = conversation;
  return NextResponse.json({ conversation: rest, messages });
}
