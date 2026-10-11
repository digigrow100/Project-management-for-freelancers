import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createExtensionPairingCode } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    const result = await createExtensionPairingCode(profile.id, new URL(request.url).origin);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create pairing code." },
      { status: 400 },
    );
  }
}
