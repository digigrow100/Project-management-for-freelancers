import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { explainWhatsAppMessage } from "@/lib/whatsappTranslation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { clientId: string } }) {
  try {
    const profile = await requireProfile();
    const body = await request.json();
    const messageId = typeof body?.messageId === "string" ? body.messageId : "";
    if (!messageId) {
      return NextResponse.json({ error: "messageId is required." }, { status: 400 });
    }

    const explanation = await explainWhatsAppMessage(profile, params.clientId, messageId);
    return NextResponse.json({ explanation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not explain message.";
    return NextResponse.json({ error: message }, { status: message === "Access denied." ? 403 : 400 });
  }
}
