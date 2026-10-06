import { NextResponse } from "next/server";
import { pairExtension } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      pairingCode?: string;
      deviceId?: string;
      extensionInstallId?: string;
      userAgent?: string;
      deviceLabel?: string;
    };
    const result = await pairExtension({
      pairingCode: String(body.pairingCode ?? ""),
      deviceId: String(body.deviceId ?? ""),
      extensionInstallId: String(body.extensionInstallId ?? ""),
      userAgent: String(body.userAgent ?? ""),
      deviceLabel: String(body.deviceLabel ?? ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pairing failed." },
      { status: 400 },
    );
  }
}
