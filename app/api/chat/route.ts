import { NextResponse } from "next/server";
import { handleChat } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.message || typeof body.message !== "string")
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    const res = await handleChat({
      conversationId: body.conversationId,
      message: body.message,
      productId: body.productId,
      page: body.page,
      channel: body.channel === "test" ? "test" : "web",
    });
    return NextResponse.json(res);
  } catch (err) {
    console.error("[api/chat]", err);
    return NextResponse.json({ error: "Vee is having trouble right now. Please try again." }, { status: 500 });
  }
}
