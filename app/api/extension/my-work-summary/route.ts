import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { getEmployeeActivitySummary } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await requireProfile();
    const summary = await getEmployeeActivitySummary(profile.id);
    return NextResponse.json({ summary }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ summary: null }, { status: 401 });
  }
}
