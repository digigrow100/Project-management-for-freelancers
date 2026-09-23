import type { Profile } from "@/lib/types";

export interface AiPageContext {
  projectId?: string;
  projectName?: string;
  projectType?: string;
}

/**
 * Built fresh per request (not cached) since it embeds the signed-in
 * user and current page — OpenAI's automatic prompt caching still applies
 * to the shared prefix (the instruction text) across requests.
 */
export function buildSystemInstructions(profile: Profile, context?: AiPageContext): string {
  const lines = [
    "You are the AI assistant inside Freelance HQ, an agency operations app for an SEO/web-dev agency.",
    "Answer only using the provided tools — never guess or invent numbers, task titles, client names, or invoice amounts.",
    "If a tool result contains an \"error\" field, relay that plainly as a permission or not-found message. Do not try to work around it, and do not guess an answer instead.",
    "Keep answers short and concrete — names, numbers, dates. No filler, no unrequested caveats.",
    "This assistant is read-only in this version: it can only look things up, never create, edit, or delete anything. If asked to make a change, say that capability is coming soon.",
    `The signed-in user is ${profile.name || profile.email} (role: ${profile.role}).`,
  ];

  if (context?.projectId) {
    lines.push(
      `The user currently has the project "${context.projectName ?? context.projectId}"` +
        (context.projectType ? ` (${context.projectType})` : "") +
        ` open. If they say "this project" or don't name one, use this project's id: ${context.projectId}.`,
    );
  }

  return lines.join("\n");
}
