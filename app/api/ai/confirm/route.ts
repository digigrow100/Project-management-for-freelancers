import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import * as store from "@/lib/store";
import * as actions from "@/lib/actions";
import type { ReportPeriodType } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The only place an AI-proposed write actually happens — and it never calls
 * the AI. This route runs exactly one of the app's existing, unmodified
 * Server Actions per action type, exactly as if the user had submitted the
 * equivalent form. Permission is re-checked here (inside that real Server
 * Action) at confirm time, not just when the proposal was staged.
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { pendingActionId?: unknown; decision?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const pendingActionId = typeof body.pendingActionId === "string" ? body.pendingActionId : "";
  const decision = body.decision === "reject" ? "reject" : "confirm";
  if (!pendingActionId) return NextResponse.json({ error: "pendingActionId is required." }, { status: 400 });

  const pending = await store.getAiPendingAction(pendingActionId);
  if (!pending) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  if (pending.createdBy !== profile.id) return NextResponse.json({ error: "Not your proposal." }, { status: 403 });
  if (pending.status !== "pending") {
    return NextResponse.json({ error: `This proposal was already ${pending.status}.` }, { status: 409 });
  }

  if (decision === "reject") {
    await store.resolveAiPendingAction(pending.id, "rejected");
    return NextResponse.json({ status: "rejected" });
  }

  try {
    switch (pending.actionType) {
      case "create_tasks": {
        const payload = pending.payload as {
          projectId: string;
          assigneeId?: string | null;
          tasks: { title: string; scheduledFor: string }[];
        };
        for (const task of payload.tasks) {
          const formData = new FormData();
          formData.set("projectId", payload.projectId);
          formData.set("title", task.title);
          formData.set("scheduledFor", task.scheduledFor);
          if (payload.assigneeId) formData.set("assignedTo", payload.assigneeId);
          await actions.createTaskAction(formData);
        }
        await store.resolveAiPendingAction(pending.id, "confirmed");
        return NextResponse.json({ status: "confirmed", count: payload.tasks.length, projectId: payload.projectId });
      }

      case "create_invoice": {
        const payload = pending.payload as {
          clientId: string;
          projectId: string | null;
          items: { description: string; quantity: number; unitPrice: number }[];
          currency: string;
          issueDate: string;
          dueDate: string;
        };
        const formData = new FormData();
        formData.set("clientId", payload.clientId);
        if (payload.projectId) formData.set("projectId", payload.projectId);
        formData.set("items", JSON.stringify(payload.items));
        formData.set("currency", payload.currency);
        formData.set("issueDate", payload.issueDate);
        formData.set("dueDate", payload.dueDate);
        formData.set("status", "draft");
        const invoiceId = await actions.createInvoiceAction(formData);
        if (!invoiceId) {
          return NextResponse.json({ error: "The invoice could not be created — the client or items were invalid." }, { status: 422 });
        }
        await store.resolveAiPendingAction(pending.id, "confirmed");
        return NextResponse.json({ status: "confirmed", invoiceId });
      }

      case "create_project": {
        const payload = pending.payload as { clientId: string; name: string; type: string; description: string };
        const formData = new FormData();
        formData.set("clientId", payload.clientId);
        formData.set("name", payload.name);
        formData.set("type", payload.type);
        formData.set("description", payload.description);
        const projectId = await actions.createProjectAction(formData);
        if (!projectId) {
          return NextResponse.json({ error: "The project could not be created — the client or name were invalid." }, { status: 422 });
        }
        await store.resolveAiPendingAction(pending.id, "confirmed");
        return NextResponse.json({ status: "confirmed", projectId });
      }

      case "create_seo_report": {
        const payload = pending.payload as { projectId: string; period: string; periodType: ReportPeriodType };
        await actions.generateSeoReportAction(payload.projectId, payload.period, payload.periodType);
        await store.resolveAiPendingAction(pending.id, "confirmed");
        return NextResponse.json({ status: "confirmed", projectId: payload.projectId, period: payload.period });
      }

      default:
        return NextResponse.json({ error: "Unknown action type." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to execute the action." }, { status: 500 });
  }
}
