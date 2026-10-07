import { NextResponse } from "next/server";
import { authenticateWhatsAppBridge, getBridgeClientConfig } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const device = await authenticateWhatsAppBridge(request);
    return NextResponse.json({ clients: await getBridgeClientConfig(device) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load bridge config.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}
