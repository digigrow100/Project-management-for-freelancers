import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { revokeWhatsAppSharedHistory, shareWhatsAppHistory } from "@/lib/whatsappBridgeRequests";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const body = await request.json();
    if (body.action === "revoke") {
      await revokeWhatsAppSharedHistory(profile.id, String(body.clientId || ""), String(body.userId || ""));
      return NextResponse.json({ ok: true, shared: 0 });
    }
    const result = await shareWhatsAppHistory(profile.id, {
      clientId: String(body.clientId || ""),
      userId: String(body.userId || ""),
      messageIds: Array.isArray(body.messageIds) ? body.messageIds.map(String) : [],
      remoteMessageKeys: Array.isArray(body.remoteMessageKeys) ? body.remoteMessageKeys.map(String) : [],
      dateFrom: typeof body.dateFrom === "string" ? body.dateFrom : null,
      dateTo: typeof body.dateTo === "string" ? body.dateTo : null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not share WhatsApp history." }, { status: 400 });
  }
}
