import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  addScreenShareSignal,
  listLiveScreenShares,
  listScreenShareSignals,
} from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return NextResponse.json({ sessions: await listLiveScreenShares() });
    const afterId = Number(url.searchParams.get("afterId") ?? "0");
    return NextResponse.json({
      signals: await listScreenShareSignals({ sessionId, afterId, receiver: "admin" }),
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      sessionId?: string;
      signalType?: "offer" | "answer" | "ice";
      payload?: Record<string, unknown>;
    };
    if (!body.sessionId || !body.signalType || !body.payload) throw new Error("Invalid signal.");
    await addScreenShareSignal({
      sessionId: body.sessionId,
      sender: "admin",
      signalType: body.signalType,
      payload: body.payload,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Signal failed." }, { status: 400 });
  }
}
