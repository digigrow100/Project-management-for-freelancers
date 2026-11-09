import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import * as store from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const conversation = await store.getAiConversationForUser(params.id, profile.id);
  if (!conversation) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const messages = await store.listAiMessages(conversation.id);
  return NextResponse.json({ conversation, messages });
}

export async function DELETE(_req: Request, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const conversation = await store.getAiConversationForUser(params.id, profile.id);
  if (!conversation) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await store.deleteAiConversation(conversation.id);
  return NextResponse.json({ ok: true });
}
