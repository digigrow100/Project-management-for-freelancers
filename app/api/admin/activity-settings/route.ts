import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getActivitySettings, updateActivityRetention } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ settings: await getActivitySettings() });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { retentionDays?: number };
    const retentionDays = await updateActivityRetention(Number(body.retentionDays ?? 60), admin.id);
    return NextResponse.json({ ok: true, retentionDays });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed." }, { status: 400 });
  }
}
