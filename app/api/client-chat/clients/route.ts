import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { listAccessibleWhatsAppClients } from "@/lib/whatsappBridge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await requireProfile();
    return NextResponse.json({ clients: await listAccessibleWhatsAppClients(profile) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
