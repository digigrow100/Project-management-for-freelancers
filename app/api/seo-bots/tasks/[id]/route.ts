import { z } from "zod";
import { resultInput } from "@/lib/seoBots/core";
import { botDigest, botRequestLimit, recordBotResult } from "@/lib/seoBots/server";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!botDigest(key)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Task not found" }, { status: 404, headers });
  try {
    await botRequestLimit("result");
  } catch {
    return Response.json({ error: "Results temporarily unavailable" }, { status: 503, headers });
  }

  if (!request.body) return Response.json({ error: "Invalid result" }, { status: 400, headers });
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  let input;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 32_768) {
        await reader.cancel();
        return Response.json({ error: "Result too large" }, { status: 413, headers });
      }
      body += decoder.decode(part.value, { stream: true });
    }
    input = resultInput.safeParse(JSON.parse(body + decoder.decode()));
  } catch {
    return Response.json({ error: "Invalid result" }, { status: 400, headers });
  }
  if (!input.success) return Response.json({ error: "Invalid result" }, { status: 400, headers });

  try {
    const state = await recordBotResult(key, id.data, input.data);
    if (state === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    if (state === "stale_date") return Response.json({ error: "The work date changed. Reload the queue." }, { status: 409, headers });
    if (state === "not_found") return Response.json({ error: "Task not found" }, { status: 404, headers });
    return Response.json({ status: state }, { headers });
  } catch {
    return Response.json({ error: "Could not save the result" }, { status: 503, headers });
  }
}
