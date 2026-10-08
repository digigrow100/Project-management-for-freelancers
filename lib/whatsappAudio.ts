import { toFile } from "openai";
import { getOpenAiClient, AI_MODEL_DEFAULT } from "@/lib/ai/openaiClient";
import { getSupabase } from "@/lib/supabaseClient";
import {
  getBridgeClientConfig,
  type AuthenticatedWhatsAppBridge,
} from "@/lib/whatsappBridge";

const MAX_AUDIO_BYTES = 2_500_000;
const MAX_TRANSCRIPT_CHARS = 12000;
const AUDIO_RETRY_AFTER_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function clean(value: unknown, max = 5000) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim().slice(0, max)
    : "";
}

function nowIso() {
  return new Date().toISOString();
}

function parseJsonObject(text: string): Record<string, unknown> {
  const stripped = text
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "");
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("AI returned an invalid voice-note response.");
  return JSON.parse(stripped.slice(first, last + 1)) as Record<string, unknown>;
}

function audioExtension(mimeType: string) {
  const mime = mimeType.toLowerCase();
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("wav")) return "wav";
  return "ogg";
}

async function claimAudioJob(input: {
  clientId: string;
  bridgeId: string;
  remoteMessageKey: string;
  receivedAt: string;
  mimeType: string;
  byteSize: number;
}) {
  const supabase = getSupabase();
  const now = nowIso();
  const { data, error } = await supabase
    .from("freelance_hq_whatsapp_audio_jobs")
    .insert({
      client_id: input.clientId,
      bridge_id: input.bridgeId,
      remote_message_key: input.remoteMessageKey,
      received_at: input.receivedAt,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      status: "processing",
      attempts: 1,
      updated_at: now,
    })
    .select("id,status,attempts,updated_at,message_id")
    .maybeSingle();

  if (!error && data) {
    return { claimed: true, id: String(data.id), attempts: 1 };
  }

  if (error && error.code !== "23505") throw error;

  const { data: existing, error: existingError } = await supabase
    .from("freelance_hq_whatsapp_audio_jobs")
    .select("id,status,attempts,updated_at,message_id")
    .eq("client_id", input.clientId)
    .eq("remote_message_key", input.remoteMessageKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("Could not claim voice note.");

  if (existing.status === "done") {
    return {
      claimed: false,
      id: String(existing.id),
      attempts: Number(existing.attempts || 1),
      messageId: existing.message_id ? String(existing.message_id) : "",
    };
  }

  const attempts = Number(existing.attempts || 1);
  const updatedAt = new Date(String(existing.updated_at || "")).getTime();
  const stale = !Number.isFinite(updatedAt) || Date.now() - updatedAt >= AUDIO_RETRY_AFTER_MS;
  if (!stale || attempts >= MAX_ATTEMPTS) {
    return { claimed: false, id: String(existing.id), attempts };
  }

  const nextAttempts = attempts + 1;
  let retry = supabase
    .from("freelance_hq_whatsapp_audio_jobs")
    .update({
      status: "processing",
      attempts: nextAttempts,
      bridge_id: input.bridgeId,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      error_text: "",
      updated_at: now,
    })
    .eq("id", existing.id)
    .eq("updated_at", existing.updated_at);

  const { data: retried, error: retryError } = await retry
    .select("id")
    .maybeSingle();
  if (retryError) throw retryError;
  return {
    claimed: Boolean(retried),
    id: String(existing.id),
    attempts: nextAttempts,
  };
}

async function markAudioJobFailed(jobId: string, errorText: string) {
  await getSupabase()
    .from("freelance_hq_whatsapp_audio_jobs")
    .update({
      status: "failed",
      error_text: clean(errorText, 1200),
      updated_at: nowIso(),
      completed_at: nowIso(),
    })
    .eq("id", jobId);
}

async function makeMeaningfulRomanUrdu(rawTranscript: string) {
  const client = getOpenAiClient();
  const prompt = [
    "Convert this WhatsApp voice-note transcript into a faithful, natural Roman Urdu chat message for a Pakistani support team.",
    'Return JSON only: {"romanUrdu":"final text","sourceLanguage":"spoken language"}',
    "",
    "STRICT RULES:",
    "- Preserve the speaker's actual meaning, request, question, certainty, names, amounts, dates, URLs, codes and technical terms.",
    "- Write romanUrdu only with Latin letters. Never use Urdu or Arabic script in romanUrdu.",
    "- Do not add facts, promises, diagnoses, assumptions or missing context.",
    "- Remove filler words, repeated stutters and transcription clutter only when meaning is unchanged.",
    "- Keep the message in the speaker's voice. Do not prefix it with 'client keh raha hai' or turn it into a third-person summary.",
    "- If a word is genuinely unclear, write [unclear] instead of guessing.",
    "- If the speech is already Roman Urdu/Urdu/Punjabi, produce clean natural Roman Urdu.",
    "- sourceLanguage is the dominant language actually spoken in the voice note, for example English, Arabic, Urdu, Punjabi, Spanish, French or German.",
    "",
    "Transcript:",
    rawTranscript,
  ].join("\n");

  const response = await client.responses.create({
    model: AI_MODEL_DEFAULT,
    input: [{ role: "user", content: prompt }],
    max_output_tokens: 1200,
    store: false,
  });

  const parsed = parseJsonObject(response.output_text);
  const romanUrdu = clean(parsed.romanUrdu, 5000);
  const sourceLanguage = clean(parsed.sourceLanguage, 80);
  if (!romanUrdu) throw new Error("AI could not convert the voice note into Roman Urdu.");
  return { romanUrdu, sourceLanguage: sourceLanguage || "Unknown" };
}

export async function ingestWhatsAppAudio(
  device: AuthenticatedWhatsAppBridge,
  rawInput: unknown,
) {
  const input = rawInput && typeof rawInput === "object"
    ? (rawInput as Record<string, unknown>)
    : {};

  const clientId = clean(input.clientId, 100);
  const remoteMessageKey = clean(input.remoteMessageKey, 500);
  const mimeType = clean(input.mimeType, 120) || "audio/ogg";
  const dataBase64 = typeof input.dataBase64 === "string" ? input.dataBase64 : "";
  const receivedAtRaw = clean(input.receivedAt, 100);

  if (!clientId || !remoteMessageKey || !receivedAtRaw || !dataBase64) {
    throw new Error("Voice note data is incomplete.");
  }

  const receivedTime = new Date(receivedAtRaw).getTime();
  if (!Number.isFinite(receivedTime)) throw new Error("Voice note timestamp is invalid.");
  const receivedAt = new Date(receivedTime).toISOString();

  const config = await getBridgeClientConfig(device);
  const clientConfig = config.find((item) => item.clientId === clientId);
  if (!clientConfig) throw new Error("Voice note client is not mapped to this bridge.");

  const syncFromTime = new Date(clientConfig.syncFrom).getTime();
  if (Number.isFinite(syncFromTime) && receivedTime < syncFromTime) {
    return { skipped: true, reason: "before_sync_window" };
  }

  const bytes = Buffer.from(dataBase64, "base64");
  if (!bytes.length) throw new Error("Voice note audio is empty.");
  if (bytes.length > MAX_AUDIO_BYTES) {
    throw new Error("Voice note is too large to process safely.");
  }

  const claim = await claimAudioJob({
    clientId,
    bridgeId: device.id,
    remoteMessageKey,
    receivedAt,
    mimeType,
    byteSize: bytes.length,
  });

  if (!claim.claimed) {
    return {
      skipped: true,
      reason: claim.messageId ? "already_done" : "already_processing",
      messageId: claim.messageId || null,
    };
  }

  try {
    const openai = getOpenAiClient();
    const file = await toFile(
      bytes,
      "whatsapp-voice." + audioExtension(mimeType),
      { type: mimeType.split(";")[0] || "audio/ogg" },
    );

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
    });

    const rawTranscript = clean(transcription.text, MAX_TRANSCRIPT_CHARS);
    if (!rawTranscript) throw new Error("No speech could be transcribed from this voice note.");

    const meaningful = await makeMeaningfulRomanUrdu(rawTranscript);
    const supabase = getSupabase();
    const now = nowIso();

    const { data: inserted, error: insertError } = await supabase
      .from("freelance_hq_whatsapp_messages")
      .upsert(
        {
          client_id: clientId,
          direction: "inbound",
          body: meaningful.romanUrdu,
          status: "received",
          bridge_id: device.id,
          remote_message_key: remoteMessageKey,
          remote_timestamp: receivedAt,
          received_at: receivedAt,
          updated_at: now,
        },
        { onConflict: "client_id,remote_message_key", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (insertError) throw insertError;

    let messageId = inserted?.id ? String(inserted.id) : "";
    if (!messageId) {
      const { data: existingMessage, error: existingMessageError } = await supabase
        .from("freelance_hq_whatsapp_messages")
        .select("id")
        .eq("client_id", clientId)
        .eq("remote_message_key", remoteMessageKey)
        .maybeSingle();
      if (existingMessageError) throw existingMessageError;
      messageId = existingMessage?.id ? String(existingMessage.id) : "";
    }
    if (!messageId) throw new Error("Voice note text could not be stored.");

    const { error: translationError } = await supabase
      .from("freelance_hq_whatsapp_message_translations")
      .upsert(
        {
          message_id: messageId,
          client_id: clientId,
          roman_urdu: meaningful.romanUrdu,
          source_language: meaningful.sourceLanguage,
          updated_at: now,
        },
        { onConflict: "message_id" },
      );
    if (translationError) throw translationError;

    const { error: jobError } = await supabase
      .from("freelance_hq_whatsapp_audio_jobs")
      .update({
        status: "done",
        raw_transcript: rawTranscript,
        detected_language: meaningful.sourceLanguage,
        final_text: meaningful.romanUrdu,
        message_id: messageId,
        error_text: "",
        updated_at: now,
        completed_at: now,
      })
      .eq("id", claim.id);
    if (jobError) throw jobError;

    return {
      inserted: true,
      messageId,
      sourceLanguage: meaningful.sourceLanguage,
    };
  } catch (error) {
    await markAudioJobFailed(
      claim.id,
      error instanceof Error ? error.message : "Voice note processing failed.",
    );
    throw error;
  }
}


export async function reportWhatsAppAudioFailure(
  device: AuthenticatedWhatsAppBridge,
  rawInput: unknown,
) {
  const input = rawInput && typeof rawInput === "object"
    ? (rawInput as Record<string, unknown>)
    : {};

  const clientId = clean(input.clientId, 100);
  const remoteMessageKey = clean(input.remoteMessageKey, 500);
  const receivedAtRaw = clean(input.receivedAt, 100);
  const errorText = clean(input.error, 1200) || "Voice-note capture failed before upload.";

  if (!clientId || !remoteMessageKey || !receivedAtRaw) {
    throw new Error("Voice-note failure data is incomplete.");
  }

  const receivedTime = new Date(receivedAtRaw).getTime();
  if (!Number.isFinite(receivedTime)) throw new Error("Voice-note timestamp is invalid.");
  const receivedAt = new Date(receivedTime).toISOString();

  const config = await getBridgeClientConfig(device);
  if (!config.some((item) => item.clientId === clientId)) {
    throw new Error("Voice note client is not mapped to this bridge.");
  }

  const supabase = getSupabase();
  const { data: existing, error: existingError } = await supabase
    .from("freelance_hq_whatsapp_audio_jobs")
    .select("id,status,attempts")
    .eq("client_id", clientId)
    .eq("remote_message_key", remoteMessageKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "done") return { recorded: false, reason: "already_done" };

  const now = nowIso();
  if (existing?.id) {
    const { error } = await supabase
      .from("freelance_hq_whatsapp_audio_jobs")
      .update({
        status: "failed",
        attempts: Math.min(MAX_ATTEMPTS, Number(existing.attempts || 0) + 1),
        bridge_id: device.id,
        error_text: errorText,
        updated_at: now,
        completed_at: now,
      })
      .eq("id", existing.id);
    if (error) throw error;
    return { recorded: true };
  }

  const { error } = await supabase
    .from("freelance_hq_whatsapp_audio_jobs")
    .insert({
      client_id: clientId,
      bridge_id: device.id,
      remote_message_key: remoteMessageKey,
      received_at: receivedAt,
      mime_type: "",
      byte_size: 0,
      status: "failed",
      attempts: 1,
      error_text: errorText,
      updated_at: now,
      completed_at: now,
    });
  if (error && error.code !== "23505") throw error;
  return { recorded: true };
}
