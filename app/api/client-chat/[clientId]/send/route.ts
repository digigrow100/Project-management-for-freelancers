import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { queueWhatsAppMessage } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { clientId: string } }) {
  try {
    const profile = await requireProfile();
    const body = await request.json();
    return NextResponse.json({ ok: true, ...(await queueWhatsAppMessage(profile, params.clientId, body.body)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send message.";
    return NextResponse.json({ error: message }, { status: /access|cannot send/i.test(message) ? 403 : 400 });
  }
}
