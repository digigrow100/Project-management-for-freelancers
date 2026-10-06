import { NextResponse } from "next/server";
import { authenticateExtensionRequest, endScreenShare, startScreenShare } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const device = await authenticateExtensionRequest(request);
    const body = (await request.json()) as { action?: string; sessionId?: string; microphoneEnabled?: boolean };
    if (body.action === "end" && body.sessionId) {
      await endScreenShare(device, body.sessionId);
      return NextResponse.json({ ok: true });
    }
    const sessionId = await startScreenShare(device, body.microphoneEnabled === true);
    return NextResponse.json({ ok: true, sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Screen share request failed.";
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}
