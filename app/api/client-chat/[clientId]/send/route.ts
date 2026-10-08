import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { queueWhatsAppMessage } from "@/lib/whatsappBridge";
import {
  cacheOutboundRomanUrdu,
  prepareWhatsAppOutgoingMessage,
} from "@/lib/whatsappTranslation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { clientId: string } }) {
  try {
    const profile = await requireProfile();
    const body = await request.json();
    const prepared = await prepareWhatsAppOutgoingMessage(profile, params.clientId, body.body);
    const queued = await queueWhatsAppMessage(profile, params.clientId, prepared.body);

    if (prepared.romanUrduBody) {
      try {
        await cacheOutboundRomanUrdu(
          queued.id,
          params.clientId,
          prepared.romanUrduBody,
          prepared.clientLanguage,
        );
      } catch {
        // The WhatsApp message is already queued. A cache failure must never
        // make the UI retry and accidentally send the same message twice.
      }
    }

    return NextResponse.json({
      ok: true,
      ...queued,
      translated: prepared.translated,
      clientLanguage: prepared.clientLanguage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send message.";
    return NextResponse.json(
      { error: message },
      { status: /access|cannot send/i.test(message) ? 403 : /translate|language|AI/i.test(message) ? 502 : 400 },
    );
  }
}
