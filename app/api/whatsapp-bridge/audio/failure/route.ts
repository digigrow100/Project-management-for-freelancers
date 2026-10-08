import { NextResponse } from "next/server";
import { authenticateWhatsAppBridge } from "@/lib/whatsappBridge";
import { reportWhatsAppAudioFailure } from "@/lib/whatsappAudio";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const device = await authenticateWhatsAppBridge(request);
    const body = await request.json();
    const result = await reportWhatsAppAudioFailure(device, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record voice-note failure.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Unauthorized." ? 401 : 400 },
    );
  }
}
