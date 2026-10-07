import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createAdminWhatsAppRequest, getAdminWhatsAppRequest } from "@/lib/whatsappBridgeRequests";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const body = await request.json();
    const result = await createAdminWhatsAppRequest(profile.id, {
      requestType: body.requestType,
      query: body.query,
      chatKey: body.chatKey,
      chatLabel: body.chatLabel,
      phone: body.phone,
      clientId: body.clientId,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create WhatsApp request." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "Request ID is required." }, { status: 400 });
    return NextResponse.json(await getAdminWhatsAppRequest(profile.id, id), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load WhatsApp request." }, { status: 400 });
  }
}
