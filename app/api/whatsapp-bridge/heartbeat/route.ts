import { NextResponse } from "next/server";
import { authenticateWhatsAppBridge, updateWhatsAppBridgeHeartbeat } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const device = await authenticateWhatsAppBridge(request);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ ok: true, ...(await updateWhatsAppBridgeHeartbeat(device, body)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Heartbeat failed.";
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}
