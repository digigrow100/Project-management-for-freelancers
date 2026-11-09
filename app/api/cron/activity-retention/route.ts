import { NextRequest, NextResponse } from "next/server";
import { cleanupOldEmployeeActivity } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "Scheduler is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await cleanupOldEmployeeActivity();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cleanup failed." },
      { status: 500 },
    );
  }
}
