import { NextResponse } from "next/server";
import { authenticateExtensionRequest, ingestPromptBatch } from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const device = await authenticateExtensionRequest(request);
    const body = (await request.json()) as { prompts?: unknown };
    const result = await ingestPromptBatch(device, body.prompts);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prompt upload failed.";
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized." ? 401 : 400 });
  }
}
