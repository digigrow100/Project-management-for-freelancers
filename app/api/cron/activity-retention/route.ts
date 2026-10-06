import { NextRequest, NextResponse } from "next/server";
import { cleanupOldEmployeeActivity } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== "Bearer " + cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await cleanupOldEmployeeActivity();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Cleanup failed." },
      { status: 500 },
    );
  }
}
