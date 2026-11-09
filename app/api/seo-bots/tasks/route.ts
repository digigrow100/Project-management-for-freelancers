import { botDigest, botQueue, botRequestLimit } from "@/lib/seoBots/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const key = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!botDigest(key)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    await botRequestLimit("queue");
    const data = await botQueue(key);
    return data ? Response.json(data, { headers }) : Response.json({ error: "Unauthorized" }, { status: 401, headers });
  } catch {
    return Response.json({ error: "Queue temporarily unavailable" }, { status: 503, headers });
  }
}
