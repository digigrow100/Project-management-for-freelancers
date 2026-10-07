import { NextResponse } from "next/server";
import { authenticateWhatsAppBridge } from "@/lib/whatsappBridge";
import { claimWhatsAppBridgeRequest, completeWhatsAppBridgeRequest } from "@/lib/whatsappBridgeRequests";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const device = await authenticateWhatsAppBridge(request);
    return NextResponse.json({ request: await claimWhatsAppBridgeRequest(device) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load bridge requests.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const device = await authenticateWhatsAppBridge(request);
    const body = await request.json();
    await completeWhatsAppBridgeRequest(device, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete bridge request.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}
