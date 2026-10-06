import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteEmployeeActivity, getEmployeeActivitySummaries, queryEmployeeActivity } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86400000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    if (url.searchParams.get("summary") === "1") {
      return NextResponse.json({ summaries: await getEmployeeActivitySummaries() });
    }
    const fallback = defaultRange();
    const from = url.searchParams.get("from") || fallback.from;
    const to = url.searchParams.get("to") || fallback.to;
    const items = await queryEmployeeActivity({
      from,
      to,
      employeeId: url.searchParams.get("employeeId") || undefined,
      projectId: url.searchParams.get("projectId") || undefined,
      website: url.searchParams.get("website") || undefined,
      activityType: url.searchParams.get("activityType") || undefined,
      deviceId: url.searchParams.get("deviceId") || undefined,
      aiOnly: url.searchParams.get("aiOnly") === "1",
    });
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 403 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      mode?: "selected" | "employee" | "before";
      ids?: string[];
      employeeId?: string;
      before?: string;
    };
    if (!body.mode) throw new Error("Delete mode is required.");
    await deleteEmployeeActivity({
      mode: body.mode,
      ids: body.ids,
      employeeId: body.employeeId,
      before: body.before,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed." }, { status: 400 });
  }
}
