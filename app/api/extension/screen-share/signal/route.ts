import { NextResponse } from "next/server";
import { addScreenShareSignal, authenticateExtensionRequest, listScreenShareSignals } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const device = await authenticateExtensionRequest(request);
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const afterId = Number(url.searchParams.get("afterId") ?? "0");
    const signals = await listScreenShareSignals({ sessionId, afterId, receiver: "employee", device });
    return NextResponse.json({ signals });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signal read failed.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const device = await authenticateExtensionRequest(request);
    const body = (await request.json()) as {
      sessionId?: string;
      signalType?: "offer" | "answer" | "ice";
      payload?: Record<string, unknown>;
    };
    if (!body.sessionId || !body.signalType || !body.payload) throw new Error("Invalid signal.");
    await addScreenShareSignal({
      sessionId: body.sessionId,
      sender: "employee",
      signalType: body.signalType,
      payload: body.payload,
      device,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signal upload failed.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}
