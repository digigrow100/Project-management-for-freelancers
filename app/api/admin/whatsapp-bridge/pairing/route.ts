import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createWhatsAppBridgePairingCode } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

    // Pair against the exact host that generated the code. This avoids stale or
    // misconfigured APP_URL / Vercel production aliases returning a 404 HTML page.
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost || request.headers.get("host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const requestUrl = new URL(request.url);
    const protocol = forwardedProto || requestUrl.protocol.replace(":", "") || "https";
    const bridgeOrigin = host ? `${protocol}://${host}` : requestUrl.origin;

    return NextResponse.json(await createWhatsAppBridgePairingCode(profile.id, bridgeOrigin));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create pairing code." }, { status: 400 });
  }
}
