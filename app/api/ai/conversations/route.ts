import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import * as store from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const conversations = await store.listAiConversations(profile.id);
  return NextResponse.json({ conversations });
}
