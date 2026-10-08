import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { listWhatsAppMessages } from "@/lib/whatsappBridge";
import {
  ensureWhatsAppMessageTranslations,
  getWhatsAppTranslationSetting,
  setWhatsAppTranslationEnabled,
} from "@/lib/whatsappTranslation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { clientId: string } }) {
  try {
    const profile = await requireProfile();
    const setting = await getWhatsAppTranslationSetting(profile, params.clientId);
    return NextResponse.json({ setting }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load translation setting.";
    return NextResponse.json({ error: message }, { status: message === "Access denied." ? 403 : 400 });
  }
}

export async function POST(request: Request, { params }: { params: { clientId: string } }) {
  try {
    const profile = await requireProfile();
    const body = await request.json();
    const enabled = body?.enabled === true;
    let setting = await setWhatsAppTranslationEnabled(profile, params.clientId, enabled);
    let translationError = "";

    if (enabled) {
      const messages = await listWhatsAppMessages(profile, params.clientId);
      const result = await ensureWhatsAppMessageTranslations(profile, params.clientId, messages);
      setting = result.setting;
      translationError = result.error;
    }

    return NextResponse.json({ ok: true, setting, translationError });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update translation setting.";
    return NextResponse.json({ error: message }, { status: message === "Access denied." ? 403 : 400 });
  }
}
