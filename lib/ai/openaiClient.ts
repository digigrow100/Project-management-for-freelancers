import OpenAI from "openai";

let client: OpenAI | null = null;

/** Server-only OpenAI client. Never import this from a "use client" file — the API key must never reach the browser. */
export function getOpenAiClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    client = new OpenAI({ apiKey });
  }
  return client;
}

/** gpt-4.1-mini for ordinary lookups/summaries; gpt-4.1 reserved for later, more complex planning tools (Phase 6.3+). */
export const AI_MODEL_DEFAULT = "gpt-4.1-mini";
export const AI_MODEL_COMPLEX = "gpt-4.1";
