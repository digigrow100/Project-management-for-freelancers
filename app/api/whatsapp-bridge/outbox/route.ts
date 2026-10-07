import { NextResponse } from "next/server";
import { authenticateWhatsAppBridge, claimWhatsAppOutbox, resetStaleSendingMessages } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const device = await authenticateWhatsAppBridge(request);
    await resetStaleSendingMessages();
    return NextResponse.json({ messages: await claimWhatsAppOutbox(device) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load outbox.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}
