import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { revokeWhatsAppBridgeDevices } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    await revokeWhatsAppBridgeDevices();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not revoke bridge." }, { status: 400 });
  }
}
