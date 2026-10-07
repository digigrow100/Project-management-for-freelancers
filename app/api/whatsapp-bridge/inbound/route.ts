import { NextResponse } from "next/server";
import { authenticateWhatsAppBridge, ingestWhatsAppInbound } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const device = await authenticateWhatsAppBridge(request);
    const body = await request.json();
    return NextResponse.json({ ok: true, ...(await ingestWhatsAppInbound(device, body.messages)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inbound sync failed.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}
