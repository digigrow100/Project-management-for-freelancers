import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listMemberPresence } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const presence = await listMemberPresence();
    return NextResponse.json({ presence }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ presence: [] }, { status: 403 });
  }
}
