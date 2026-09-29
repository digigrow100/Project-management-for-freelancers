import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { getAllTaskFocusStates, getCompletedTasks, getOpenTasks } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [openTasks, completedTasks, focusStates] = await Promise.all([
    getOpenTasks(),
    getCompletedTasks(),
    getAllTaskFocusStates(),
  ]);

  return NextResponse.json({
    openTasks,
    completedTasks: completedTasks.slice(0, 50),
    focusStates,
  });
}
