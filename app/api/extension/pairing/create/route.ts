import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createExtensionPairingCode } from "@/lib/employeeActivity";
import { getSiteOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const profile = await requireProfile();
    const result = await createExtensionPairingCode(profile.id, getSiteOrigin());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create pairing code." },
      { status: 400 },
    );
  }
}
