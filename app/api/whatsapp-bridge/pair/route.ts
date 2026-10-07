import { NextResponse } from "next/server";
import { pairWhatsAppBridge } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await pairWhatsAppBridge({
      pairingCode: String(body.pairingCode || ""),
      deviceId: String(body.deviceId || ""),
      extensionInstallId: String(body.extensionInstallId || ""),
      deviceLabel: String(body.deviceLabel || ""),
      userAgent: request.headers.get("user-agent") || "",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pairing failed." }, { status: 400 });
  }
}
