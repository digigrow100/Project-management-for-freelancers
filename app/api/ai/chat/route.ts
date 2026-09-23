import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { getCurrentProfile } from "@/lib/auth";
import * as store from "@/lib/store";
import { getOpenAiClient, AI_MODEL_DEFAULT } from "@/lib/ai/openaiClient";
import { AI_TOOL_SCHEMAS } from "@/lib/ai/toolSchemas";
import { AI_TOOL_HANDLERS } from "@/lib/ai/tools";
import { buildSystemInstructions, type AiPageContext } from "@/lib/ai/systemPrompt";
import type { AiToolCallRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Bounds the tool-call loop per turn — a handful of lookups is normal, an unbounded loop is a bug or a misbehaving model. */
const MAX_TOOL_ITERATIONS = 5;

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { message?: unknown; conversationId?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

  const requestedConversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  let conversation = requestedConversationId
    ? await store.getAiConversationForUser(requestedConversationId, profile.id)
    : null;
  if (!conversation) {
    conversation = await store.createAiConversation(profile.id, message.slice(0, 60));
  }

  await store.addAiMessage({ conversationId: conversation.id, role: "user", content: message });

  const context = (body.context ?? undefined) as AiPageContext | undefined;
  const instructions = buildSystemInstructions(profile, context);

  let client: OpenAI;
  try {
    client = getOpenAiClient();
  } catch {
    return NextResponse.json({ error: "AI assistant is not configured yet." }, { status: 503 });
  }

  const toolCallRecords: AiToolCallRecord[] = [];
  let input: OpenAI.Responses.ResponseInput = [{ role: "user", content: message }];
  let previousResponseId = conversation.lastResponseId ?? undefined;
  let finalText = "";

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await client.responses.create({
        model: AI_MODEL_DEFAULT,
        instructions,
        input,
        tools: AI_TOOL_SCHEMAS,
        tool_choice: "auto",
        previous_response_id: previousResponseId,
        max_output_tokens: 1200,
        store: true,
      });

      previousResponseId = response.id;

      const functionCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
      );

      if (functionCalls.length === 0) {
        finalText = response.output_text;
        break;
      }

      const outputs: OpenAI.Responses.ResponseInputItem[] = [];
      for (const call of functionCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          args = {};
        }

        const handler = AI_TOOL_HANDLERS[call.name];
        let result: unknown;
        if (!handler) {
          result = { error: `Unknown tool: ${call.name}` };
        } else {
          try {
            result = await handler(profile, args);
          } catch (err) {
            result = { error: err instanceof Error ? err.message : "Tool failed." };
          }
        }

        toolCallRecords.push({ name: call.name, arguments: args, result });
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
      }

      input = outputs;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The AI assistant failed to respond." },
      { status: 502 },
    );
  }

  await store.updateAiConversation(conversation.id, { lastResponseId: previousResponseId ?? null });
  const assistantMessage = await store.addAiMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: finalText || "I couldn't put together an answer for that.",
    toolCalls: toolCallRecords,
  });

  return NextResponse.json({ conversationId: conversation.id, message: assistantMessage });
}
