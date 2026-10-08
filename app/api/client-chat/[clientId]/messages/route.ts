import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { listWhatsAppMessages } from "@/lib/whatsappBridge";
import { ensureWhatsAppMessageTranslations } from "@/lib/whatsappTranslation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { clientId: string } }) {
  try {
    const profile = await requireProfile();
    const messages = await listWhatsAppMessages(profile, params.clientId);
    const translated = await ensureWhatsAppMessageTranslations(profile, params.clientId, messages);

    const enrichedMessages = messages.map((message) => {
      const cached = translated.translations.get(message.id);
      return {
        ...message,
        translatedBody: cached?.romanUrdu || null,
        translationSourceLanguage: cached?.sourceLanguage || null,
        explanation: cached?.explanation || null,
      };
    });

    return NextResponse.json(
      {
        messages: enrichedMessages,
        translation: translated.setting,
        translationError: translated.error,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load messages.";
    return NextResponse.json({ error: message }, { status: message === "Access denied." ? 403 : 400 });
  }
}
