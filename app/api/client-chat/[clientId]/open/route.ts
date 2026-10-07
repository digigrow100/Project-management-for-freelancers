import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createWhatsAppOpenRequestForClient } from "@/lib/whatsappBridgeRequests";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    const profile = await requireProfile();
    const { clientId } = await context.params;
    const result = await createWhatsAppOpenRequestForClient(profile, clientId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not open WhatsApp chat." },
      { status: 400 },
    );
  }
}
