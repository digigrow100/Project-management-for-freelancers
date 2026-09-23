import type OpenAI from "openai";

/**
 * Phase 6.1 read-only tools. Every schema is `strict: true` — OpenAI strict
 * mode requires every property to be listed in `required`; "optional"
 * fields are modeled as nullable (`type: [..., "null"]`) instead of omitted.
 * These are the ONLY way the assistant can touch application data — see
 * lib/ai/tools.ts for the permission-checked implementations.
 */
export const AI_TOOL_SCHEMAS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "get_team_report",
    description: "Completed-task counts per team member, for today or this week, with the projects they worked on.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "this_week"] },
        memberName: {
          type: ["string", "null"],
          description: "Filter to one team member by (partial) name. Null for the whole team.",
        },
      },
      required: ["period", "memberName"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_client_summary",
    description: "A client's billing balance (invoiced/paid/outstanding), active projects, and active services. Admin only.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The client's id." },
      },
      required: ["clientId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_project_status",
    description: "A project's task progress (done/total) and its open tasks with priority and due date.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project's id." },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_seo_report",
    description:
      "SEO activity for one SEO project over a period: keyword rank movement, completed tasks, backlinks created/live, content published, technical fixes.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The SEO project's id." },
        period: {
          type: ["string", "null"],
          description: "Period key matching periodType: YYYY-MM-DD (daily), YYYY-Www (weekly), YYYY-MM (monthly). Null for the current period.",
        },
        periodType: {
          type: ["string", "null"],
          enum: ["daily", "weekly", "monthly", null],
          description: "Null defaults to monthly.",
        },
      },
      required: ["projectId", "period", "periodType"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_invoice_status",
    description: "Invoices, optionally filtered by status and/or client. Requires Finance access.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        status: {
          type: ["string", "null"],
          enum: ["draft", "sent", "paid", "partially_paid", "overdue", "cancelled", "all", null],
        },
        clientId: { type: ["string", "null"], description: "Limit to one client. Null for all clients." },
      },
      required: ["status", "clientId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_pending_tasks",
    description: "Open (not-done) tasks — the caller's own, one project's, or every visible project's.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["mine", "project", "all"] },
        projectId: { type: ["string", "null"], description: "Required when scope is 'project'; otherwise null." },
      },
      required: ["scope", "projectId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_dashboard_activity",
    description:
      "What happened on a given day across every visible project: completed tasks, keyword rank moves, backlinks created, content published, technical fixes.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        date: { type: ["string", "null"], description: "YYYY-MM-DD. Null for today." },
      },
      required: ["date"],
      additionalProperties: false,
    },
  },
];
