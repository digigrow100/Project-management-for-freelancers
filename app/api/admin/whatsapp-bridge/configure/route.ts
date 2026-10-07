import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { saveWhatsAppClientLink } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const body = await request.json();
    await saveWhatsAppClientLink({
      adminUserId: profile.id,
      clientId: String(body.clientId || ""),
      chatKey: String(body.chatKey || ""),
      chatLabel: String(body.chatLabel || ""),
      phone: String(body.phone || ""),
      isEnabled: body.isEnabled !== false,
      accessUserIds: Array.isArray(body.accessUserIds) ? body.accessUserIds.map(String) : [],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save client mapping." }, { status: 400 });
  }
}
