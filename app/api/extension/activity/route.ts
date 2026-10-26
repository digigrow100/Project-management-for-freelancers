import { ExtensionServiceUnavailable } from "@/lib/extensionAvailability";
import { NextResponse } from "next/server";
import { authenticateExtensionRequest, ingestActivityBatch } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const device = await authenticateExtensionRequest(request);
    const body = (await request.json()) as { events?: unknown };
    const result = await ingestActivityBatch(device, body.events);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ExtensionServiceUnavailable) {
      return NextResponse.json({ ok: false, error: error.message }, {
        status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      });
    }
    const message = error instanceof Error ? error.message : "Activity upload failed.";
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}
