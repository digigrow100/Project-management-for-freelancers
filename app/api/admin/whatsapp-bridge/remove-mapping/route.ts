import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { removeWhatsAppClientMapping } from "@/lib/whatsappBridgeRequests";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const body = await request.json();
    await removeWhatsAppClientMapping(profile.id, String(body.clientId || ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove mapping." }, { status: 400 });
  }
}
