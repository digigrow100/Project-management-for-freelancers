import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { getWhatsAppBridgeHealth } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    return NextResponse.json(await getWhatsAppBridgeHealth(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
