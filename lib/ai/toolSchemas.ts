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
    name: "resolve_entity",
    description:
      "Look up the id of a client, project, team member, or service by (partial) name. Call this FIRST whenever the user names an entity you don't already have the id for from earlier in this conversation or from the current page context — never guess or invent an id. " +
      "Example: user says \"create invoice for Rapid Tyres\" -> call resolve_entity({entityType:'client', query:'Rapid Tyres'}) to get clientId before calling propose_invoice. " +
      "Example: user says \"assign it to Ahmed\" -> call resolve_entity({entityType:'team_member', query:'Ahmed'}) to get memberId. " +
      "Returns up to 5 matches. Exactly one match: use it directly, no need to confirm the lookup itself. Zero matches: tell the user you couldn't find it and ask them to check the name. More than one: list the names and ask which one they mean.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        entityType: { type: "string", enum: ["client", "project", "team_member", "service"] },
        query: { type: "string", description: "The name or partial name the user used, e.g. \"FSR Recovery\" or \"Ahmed\"." },
      },
      required: ["entityType", "query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_team_report",
    description:
      "Completed-task counts per team member, for today or this week, with the projects they worked on. Use for questions like \"what did Ahmed complete today\" or \"show this week's completed tasks\" — pass memberName directly (fuzzy-matched), no need to resolve_entity first for this one tool.",
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
    description:
      "A client's billing balance (invoiced/paid/outstanding), active projects, and active services. Admin only. Requires clientId — if the user named the client (e.g. \"FSR Recovery\") and you don't have its id yet, call resolve_entity first.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "The client's id, from resolve_entity or an earlier tool result in this conversation." },
      },
      required: ["clientId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_project_status",
    description:
      "A project's task progress (done/total) and its open tasks with priority and due date. Requires projectId — use the current page context if the user is already viewing a project, otherwise call resolve_entity first if they named one (e.g. \"FSR Recovery SEO\").",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project's id, from page context, resolve_entity, or an earlier tool result in this conversation." },
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
    description:
      "Open (not-done) tasks — the caller's own ('mine'), one project's, or every visible project's ('all'). Prefer get_project_status instead when you also want task progress counts (done/total) for a single project, not just the open list.",
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

  // Write proposals — every one of these only STAGES a pending action and
  // returns a preview. None of them create/edit/delete anything by
  // themselves; the chat UI shows a Confirm/Reject card and only Confirm
  // executes the real, existing Server Action (app/api/ai/confirm).
  {
    type: "function",
    name: "propose_task_schedule",
    description:
      "Propose a batch of new tasks for a project, evenly spread across a number of days starting from a date, optionally assigned to one team member. Does NOT create the tasks — returns a preview for the user to confirm. " +
      "Requires projectId (use page context, or resolve_entity if the user named the project) and at least one task title — if the user hasn't said what tasks they want, ask them instead of guessing generic titles. " +
      "Example: \"create a keyword research task in this project\" while the user is on a project page -> propose_task_schedule({projectId: <from page context>, tasks:[{title:'Keyword research'}], days:1, startDate:null, assigneeId:null}).",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "From page context, resolve_entity, or an earlier tool result in this conversation." },
        tasks: {
          type: "array",
          description: "The task titles to schedule, in the order given.",
          items: {
            type: "object",
            properties: { title: { type: "string" } },
            required: ["title"],
            additionalProperties: false,
          },
        },
        days: { type: "integer", description: "Number of calendar days to spread the tasks across." },
        startDate: { type: ["string", "null"], description: "YYYY-MM-DD. Null for today." },
        assigneeId: {
          type: ["string", "null"],
          description: "Team member id to assign all these tasks to, from resolve_entity with entityType 'team_member'. Null to leave unassigned.",
        },
      },
      required: ["projectId", "tasks", "days", "startDate", "assigneeId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "propose_invoice",
    description:
      "Propose a new draft invoice for a client. Does NOT create it — returns a preview for the user to confirm. Requires Finance access. " +
      "Requires clientId (resolve_entity if the user named the client) and at least one priced item — if the user named a service/package (e.g. \"SEO Monthly\"), use resolve_entity with entityType 'service' to get its price rather than guessing an amount. If you don't have a price or description, ask the user instead of inventing one.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "From resolve_entity or an earlier tool result in this conversation." },
        projectId: { type: ["string", "null"], description: "Optional linked project." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unitPrice: { type: "number" },
            },
            required: ["description", "quantity", "unitPrice"],
            additionalProperties: false,
          },
        },
        currency: { type: ["string", "null"], description: "e.g. PKR, USD, GBP. Null defaults to PKR." },
        issueDate: { type: ["string", "null"], description: "YYYY-MM-DD. Null for today." },
        dueDate: { type: ["string", "null"], description: "YYYY-MM-DD. Null defaults to the issue date." },
      },
      required: ["clientId", "projectId", "items", "currency", "issueDate", "dueDate"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "propose_project",
    description:
      "Propose a new project for a client. Does NOT create it — returns a preview for the user to confirm. Admin only. Requires clientId — use resolve_entity if the user named the client.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "From resolve_entity or an earlier tool result in this conversation." },
        name: { type: "string" },
        type: { type: "string", enum: ["seo", "web_dev", "web_app", "digital_marketing", "other"] },
        description: { type: ["string", "null"] },
      },
      required: ["clientId", "name", "type", "description"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "propose_seo_report",
    description:
      "Propose generating an SEO report draft for an SEO project — collects completed work, keyword movement, backlinks, content, and technical fixes for the period. Does NOT create it — returns a preview for the user to confirm. The report is never sent to the client automatically. " +
      "Requires projectId — use page context if the user is on that project, otherwise resolve_entity. If the user asked for a report for \"this client\" and the client has more than one project, ask which project (or check resolve_entity's matches) rather than picking one.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "From page context, resolve_entity, or an earlier tool result in this conversation." },
        period: {
          type: ["string", "null"],
          description: "Period key matching periodType: YYYY-MM-DD (daily), YYYY-Www (weekly), YYYY-MM (monthly). Null for the current period.",
        },
        periodType: { type: ["string", "null"], enum: ["daily", "weekly", "monthly", null], description: "Null defaults to monthly." },
      },
      required: ["projectId", "period", "periodType"],
      additionalProperties: false,
    },
  },
];
