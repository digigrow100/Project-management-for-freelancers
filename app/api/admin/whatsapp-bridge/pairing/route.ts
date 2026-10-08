import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { getSiteOrigin } from "@/lib/site";
import { createWhatsAppBridgePairingCode } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const bridgeOrigin = vercelProduction
      ? `https://${vercelProduction.replace(/\/+$/, "")}`
      : getSiteOrigin();
    return NextResponse.json(await createWhatsAppBridgePairingCode(profile.id, bridgeOrigin));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create pairing code." }, { status: 400 });
  }
}
