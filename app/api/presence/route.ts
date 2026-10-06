import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { upsertMemberPresence } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    const body = (await request.json().catch(() => ({}))) as { active?: unknown };
    await upsertMemberPresence(profile.id, body.active === true);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
