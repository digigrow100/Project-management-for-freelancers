import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  createProjectDomainMapping,
  deleteProjectDomainMapping,
  listProjectDomainMappings,
} from "@/lib/employeeActivity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ mappings: await listProjectDomainMappings() });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as {
      projectId?: string;
      matchType?: "domain" | "url_prefix" | "github_repo";
      pattern?: string;
      label?: string;
    };
    if (!body.projectId || !body.matchType || !body.pattern) throw new Error("Project, match type and pattern are required.");
    await createProjectDomainMapping({
      projectId: body.projectId,
      matchType: body.matchType,
      pattern: body.pattern,
      label: body.label,
      createdBy: admin.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mapping failed." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { id?: string };
    if (!body.id) throw new Error("Mapping ID is required.");
    await deleteProjectDomainMapping(body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed." }, { status: 400 });
  }
}
