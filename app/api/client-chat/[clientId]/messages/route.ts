import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { listWhatsAppMessages } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { clientId: string } }) {
  try {
    const profile = await requireProfile();
    return NextResponse.json({ messages: await listWhatsAppMessages(profile, params.clientId) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load messages.";
    return NextResponse.json({ error: message }, { status: message === "Access denied." ? 403 : 400 });
  }
}
