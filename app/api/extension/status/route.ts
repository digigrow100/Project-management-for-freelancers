import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { getEmployeeExtensionHealth } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await requireProfile();
    if (profile.role !== "member") return NextResponse.json({ state: "not_linked", deviceCount: 0, lastSeenAt: null, problem: null });
    return NextResponse.json(await getEmployeeExtensionHealth(profile.id));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
