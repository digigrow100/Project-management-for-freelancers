import { NextResponse } from "next/server";
import { acknowledgeWhatsAppOutbox, authenticateWhatsAppBridge } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const device = await authenticateWhatsAppBridge(request);
    const body = await request.json();
    await acknowledgeWhatsAppOutbox(device, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Acknowledgement failed.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}
