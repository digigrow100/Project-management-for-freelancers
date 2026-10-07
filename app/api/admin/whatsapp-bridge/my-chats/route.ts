import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import {
  listAdminSavedWhatsAppChats,
  removeAdminWhatsAppChat,
  saveAdminWhatsAppChat,
} from "@/lib/whatsappBridgeRequests";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    return NextResponse.json({ chats: await listAdminSavedWhatsAppChats(profile.id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load saved WhatsApp chats." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const body = await request.json();
    const chat = await saveAdminWhatsAppChat(profile.id, body);
    return NextResponse.json({ chat });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save WhatsApp chat." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await requireProfile();
    if (profile.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id") || "";
    await removeAdminWhatsAppChat(profile.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove saved WhatsApp chat." }, { status: 400 });
  }
}
