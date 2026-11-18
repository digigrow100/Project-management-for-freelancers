import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requireHostingAdmin, requireHostingClient } from "@/lib/hosting/auth";
import { detectGitFramework } from "@/lib/hosting/apps/githubDetect";
import { gitUrlOk } from "@/lib/hosting/apps/validate";

export async function POST(request: Request) {
  try { await requireHostingAdmin(); }
  catch (error) {
    unstable_rethrow(error);
    try {
      const session = await requireHostingClient();
      if (session.adminView) return NextResponse.json({ error: "read_only" }, { status: 403 });
    } catch (inner) {
      unstable_rethrow(inner);
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }
  const body = await request.json().catch(() => null) as { url?: string; token?: string } | null;
  const url = body?.url?.trim() ?? "";
  const token = body?.token;
  if (!gitUrlOk(url) || (token && (token.length > 300 || /[\r\n\0]/.test(token)))) return NextResponse.json({ framework: null });
  const framework = await detectGitFramework(url, token || undefined);
  return NextResponse.json({ framework });
}
