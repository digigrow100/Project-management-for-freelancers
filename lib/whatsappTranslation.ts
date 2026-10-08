import type { Profile, WhatsAppChatMessage } from "@/lib/types";
import { getSupabase } from "@/lib/supabaseClient";
import { AI_MODEL_DEFAULT, getOpenAiClient } from "@/lib/ai/openaiClient";
import { canAccessClient, listWhatsAppMessages } from "@/lib/whatsappBridge";

export interface WhatsAppTranslationSetting {
  enabled: boolean;
  detectedLanguage: string;
  languageSourceMessageId: string;
}

export interface WhatsAppMessageTranslation {
  messageId: string;
  romanUrdu: string;
  sourceLanguage: string;
  explanation: string;
}

const TRANSLATION_BATCH_SIZE = 40;

function clean(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseJsonObject(text: string): Record<string, unknown> {
  const stripped = text
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "");
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("AI returned an invalid translation response.");
  return JSON.parse(stripped.slice(first, last + 1)) as Record<string, unknown>;
}

async function requireClientAccess(profile: Profile, clientId: string, requireSend = false) {
  const access = await canAccessClient(profile, clientId);
  if (!access.allowed) throw new Error("Access denied.");
  if (requireSend && !access.canSend) throw new Error("You cannot send messages to this client.");
  return access;
}

async function readSetting(clientId: string): Promise<WhatsAppTranslationSetting> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_whatsapp_translation_settings")
    .select("enabled,detected_language,language_source_message_id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  return {
    enabled: Boolean(data?.enabled),
    detectedLanguage: clean(data?.detected_language, 80),
    languageSourceMessageId: clean(data?.language_source_message_id, 100),
  };
}

export async function getWhatsAppTranslationSetting(
  profile: Profile,
  clientId: string,
): Promise<WhatsAppTranslationSetting> {
  await requireClientAccess(profile, clientId);
  return readSetting(clientId);
}

export async function setWhatsAppTranslationEnabled(
  profile: Profile,
  clientId: string,
  enabled: boolean,
): Promise<WhatsAppTranslationSetting> {
  await requireClientAccess(profile, clientId);
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("freelance_hq_whatsapp_translation_settings")
    .upsert(
      {
        client_id: clientId,
        enabled,
        updated_by: profile.id,
        updated_at: now,
      },
      { onConflict: "client_id" },
    );
  if (error) throw error;
  return readSetting(clientId);
}

async function readCachedTranslations(messageIds: string[]) {
  const result = new Map<string, WhatsAppMessageTranslation>();
  if (!messageIds.length) return result;

  const { data, error } = await getSupabase()
    .from("freelance_hq_whatsapp_message_translations")
    .select("message_id,roman_urdu,source_language,explanation")
    .in("message_id", messageIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const messageId = String(row.message_id);
    result.set(messageId, {
      messageId,
      romanUrdu: clean(row.roman_urdu),
      sourceLanguage: clean(row.source_language, 80),
      explanation: clean(row.explanation, 1800),
    });
  }
  return result;
}

async function translateBatch(
  clientId: string,
  messages: WhatsAppChatMessage[],
  knownLanguage: string,
) {
  const client = getOpenAiClient();
  const payload = messages.map((message) => ({
    id: message.id,
    direction: message.direction,
    body: message.body,
  }));

  const prompt = [
    "You translate a WhatsApp business conversation for a Pakistani support team.",
    "Return JSON only with this exact shape:",
    '{"clientLanguage":"current language used by the client","items":[{"id":"message id","romanUrdu":"clear Roman Urdu","sourceLanguage":"source language"}]}',
    "",
    "STRICT RULES:",
    "- romanUrdu MUST be natural Roman Urdu written with LATIN letters. Never return Urdu/Arabic script in romanUrdu.",
    "- Translate the meaning, not word-for-word, and make awkward wording easier to understand without inventing facts.",
    "- English sentences must also be translated into Roman Urdu. Example: 'What is this?' => 'Yeh kya hai?'. Do not simply copy an English sentence.",
    "- Arabic, Spanish, French, German and every other non-Roman-Urdu language must be converted to Roman Urdu meaning.",
    "- If a message is already Roman Urdu or Roman Punjabi, keep it close to the original and only clarify unclear wording.",
    "- Keep names, company names, phone numbers, amounts, dates, URLs, email addresses, passwords/codes, product names and technical terms unchanged.",
    "- sourceLanguage is the language of THAT individual message.",
    "- clientLanguage is determined ONLY from messages whose direction is 'inbound'. Outbound messages are team replies and MUST NEVER change clientLanguage.",
    "- The most recent inbound messages matter most. If the client clearly switches language, clientLanguage must switch too.",
    "- Distinguish Arabic from Urdu carefully even though both can use similar script. Arabic words/syntax such as ما, ماذا, هذا, اسم, اسمي, أنا are Arabic; Urdu words/syntax such as کیا, ہے, آپ, میرا, نہیں are Urdu.",
    "- If a new inbound message is misspelled or script-ambiguous, keep the previously detected language unless there is clear evidence of a language switch.",
    "",
    "Previously detected client language: " + (knownLanguage || "unknown"),
    "Messages in chronological order:",
    JSON.stringify(payload),
  ].join("\n");

  const response = await client.responses.create({
    model: AI_MODEL_DEFAULT,
    input: [{ role: "user", content: prompt }],
    max_output_tokens: 3500,
    store: false,
  });

  const parsed = parseJsonObject(response.output_text);
  const clientLanguage = clean(parsed.clientLanguage, 80);
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items = rawItems
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        id: clean(row.id, 100),
        romanUrdu: clean(row.romanUrdu),
        sourceLanguage: clean(row.sourceLanguage, 80),
      };
    })
    .filter((item) => item.id && item.romanUrdu);

  return { clientLanguage, items };
}

export async function ensureWhatsAppMessageTranslations(
  profile: Profile,
  clientId: string,
  messages: WhatsAppChatMessage[],
) {
  await requireClientAccess(profile, clientId);
  let setting = await readSetting(clientId);
  const messageIds = messages.map((message) => message.id);
  const cached = await readCachedTranslations(messageIds);

  if (!setting.enabled) {
    return { setting, translations: cached, error: "" };
  }

  const missing = messages.filter((message) => !cached.get(message.id)?.romanUrdu);
  let translationError = "";

  for (let index = 0; index < missing.length; index += TRANSLATION_BATCH_SIZE) {
    const batch = missing.slice(index, index + TRANSLATION_BATCH_SIZE);
    try {
      const translated = await translateBatch(clientId, batch, setting.detectedLanguage);
      const byId = new Map(batch.map((message) => [message.id, message]));
      const now = new Date().toISOString();
      const rows = translated.items
        .filter((item) => byId.has(item.id))
        .map((item) => ({
          message_id: item.id,
          client_id: clientId,
          roman_urdu: item.romanUrdu,
          source_language: item.sourceLanguage,
          updated_at: now,
        }));

      if (rows.length) {
        const { error } = await getSupabase()
          .from("freelance_hq_whatsapp_message_translations")
          .upsert(rows, { onConflict: "message_id" });
        if (error) throw error;

        for (const row of rows) {
          cached.set(String(row.message_id), {
            messageId: String(row.message_id),
            romanUrdu: String(row.roman_urdu),
            sourceLanguage: String(row.source_language || ""),
            explanation: cached.get(String(row.message_id))?.explanation || "",
          });
        }
      }

      const inbound = batch.filter((message) => message.direction === "inbound");
      const latestInbound = inbound[inbound.length - 1];
      if (latestInbound) {
        const latestItem = translated.items.find((item) => item.id === latestInbound.id);
        const activeLanguage = translated.clientLanguage || latestItem?.sourceLanguage || setting.detectedLanguage;
        if (activeLanguage) {
          const { error } = await getSupabase()
            .from("freelance_hq_whatsapp_translation_settings")
            .update({
              detected_language: activeLanguage,
              language_source_message_id: latestInbound.id,
              updated_by: profile.id,
              updated_at: now,
            })
            .eq("client_id", clientId);
          if (error) throw error;
          setting = {
            ...setting,
            detectedLanguage: activeLanguage,
            languageSourceMessageId: latestInbound.id,
          };
        }
      }
    } catch (error) {
      translationError = error instanceof Error ? error.message : "Translation is temporarily unavailable.";
      break;
    }
  }

  const recentInbound = messages
    .filter((message) => message.direction === "inbound")
    .slice(-8);
  const latestInbound = recentInbound[recentInbound.length - 1];

  // Older cached translations may have been created before language-source
  // tracking existed. Re-detect once from recent CLIENT messages so the next
  // reply cannot inherit a stale language from an outbound/team message.
  if (
    latestInbound &&
    setting.languageSourceMessageId !== latestInbound.id
  ) {
    try {
      const detectedLanguage = await detectClientLanguage(recentInbound, setting.detectedLanguage);
      if (detectedLanguage) {
        const now = new Date().toISOString();
        const { error } = await getSupabase()
          .from("freelance_hq_whatsapp_translation_settings")
          .update({
            detected_language: detectedLanguage,
            language_source_message_id: latestInbound.id,
            updated_by: profile.id,
            updated_at: now,
          })
          .eq("client_id", clientId);
        if (error) throw error;
        setting = {
          ...setting,
          detectedLanguage,
          languageSourceMessageId: latestInbound.id,
        };
      }
    } catch (error) {
      if (!translationError) {
        translationError = error instanceof Error ? error.message : "Could not confirm client language.";
      }
    }
  }

  return { setting, translations: cached, error: translationError };
}

async function detectClientLanguage(
  recentInbound: WhatsAppChatMessage[],
  previousLanguage: string,
) {
  const client = getOpenAiClient();
  const prompt = [
    "Detect the CURRENT language used by the client in these recent inbound WhatsApp messages.",
    'Return JSON only: {"language":"language name"}',
    "",
    "STRICT RULES:",
    "- These are CLIENT messages only. Determine the language of the most recent messages, not the team's language.",
    "- If the client clearly switched language, return the new language.",
    "- Use conversation continuity for short, misspelled or ambiguous messages.",
    "- Distinguish Arabic from Urdu carefully. Arabic examples: ما, ماذا, هذا, اسم, اسمي, أنا. Urdu examples: کیا, ہے, آپ, میرا, نہیں.",
    "- If the newest message is ambiguous, keep the previous language unless the recent context clearly shows a switch.",
    "- Return concise names such as Arabic, English, Urdu, Spanish, French, German, Punjabi, Roman Urdu.",
    "",
    "Previous detected language: " + (previousLanguage || "unknown"),
    "Recent inbound messages, oldest to newest:",
    JSON.stringify(recentInbound.map((message) => ({ id: message.id, body: message.body }))),
  ].join("\n");

  const response = await client.responses.create({
    model: AI_MODEL_DEFAULT,
    input: [{ role: "user", content: prompt }],
    max_output_tokens: 120,
    store: false,
  });
  const parsed = parseJsonObject(response.output_text);
  return clean(parsed.language, 80);
}

async function detectLanguageIfNeeded(profile: Profile, clientId: string) {
  let setting = await readSetting(clientId);
  if (!setting.enabled) return setting;

  const messages = await listWhatsAppMessages(profile, clientId);
  const recentInbound = messages
    .filter((message) => message.direction === "inbound")
    .slice(-8);

  const latestInbound = recentInbound.at(-1);
  if (!latestInbound) return setting;

  if (
    setting.detectedLanguage &&
    setting.languageSourceMessageId === latestInbound.id
  ) {
    return setting;
  }

  // First reuse the normal translation path. A newly arrived inbound message
  // is normally translated there already, so this costs no additional AI call.
  const ensured = await ensureWhatsAppMessageTranslations(profile, clientId, recentInbound);
  setting = ensured.setting;
  if (
    setting.detectedLanguage &&
    setting.languageSourceMessageId === latestInbound.id
  ) {
    return setting;
  }

  // Fallback only when the newest inbound message was already cached by an
  // older ruleset or the language marker is stale. This runs once for that
  // inbound message, then the result is cached.
  const detectedLanguage = await detectClientLanguage(recentInbound, setting.detectedLanguage);
  if (!detectedLanguage) return setting;

  const now = new Date().toISOString();
  const { error } = await getSupabase()
    .from("freelance_hq_whatsapp_translation_settings")
    .update({
      detected_language: detectedLanguage,
      language_source_message_id: latestInbound.id,
      updated_by: profile.id,
      updated_at: now,
    })
    .eq("client_id", clientId);
  if (error) throw error;

  return {
    ...setting,
    detectedLanguage,
    languageSourceMessageId: latestInbound.id,
  };
}

function isRomanUrduLanguage(language: string) {
  const normalized = language.toLowerCase();
  return normalized.includes("roman urdu") || normalized.includes("roman hindi") || normalized.includes("roman punjabi");
}

export async function prepareWhatsAppOutgoingMessage(
  profile: Profile,
  clientId: string,
  romanUrduBodyRaw: unknown,
) {
  await requireClientAccess(profile, clientId, true);
  const romanUrduBody = clean(romanUrduBodyRaw);
  if (!romanUrduBody) throw new Error("Message cannot be empty.");

  let setting = await readSetting(clientId);
  if (!setting.enabled) {
    return {
      body: romanUrduBody,
      romanUrduBody: "",
      translated: false,
      clientLanguage: "",
    };
  }

  setting = await detectLanguageIfNeeded(profile, clientId);
  if (!setting.detectedLanguage) {
    throw new Error("Client language is not known yet. Wait for an incoming client message or turn Roman Urdu translation off.");
  }

  if (isRomanUrduLanguage(setting.detectedLanguage)) {
    return {
      body: romanUrduBody,
      romanUrduBody,
      translated: false,
      clientLanguage: setting.detectedLanguage,
    };
  }

  const client = getOpenAiClient();
  const prompt = [
    "Translate this support reply from Roman Urdu into EXACTLY the target client language.",
    "Target client language: " + setting.detectedLanguage,
    'Return JSON only: {"translated":"final message"}',
    "",
    "STRICT RULES:",
    "- Use the normal native writing system of the target language.",
    "- If target is Arabic, write Arabic and NEVER Urdu.",
    "- If target is Urdu, write Urdu and NEVER Arabic.",
    "- If target is English, write natural English.",
    "- If target is Spanish, French, German or another language, write only that target language.",
    "- Do not transliterate into Roman script unless the target itself is Roman Urdu/Roman Punjabi.",
    "- Preserve the same meaning and level of certainty. Do not add promises, facts, greetings or details.",
    "- Keep names, company names, phone numbers, amounts, dates, URLs, email addresses, passwords/codes, product names and technical terms unchanged.",
    "",
    "Roman Urdu reply:",
    romanUrduBody,
  ].join("\n");

  const response = await client.responses.create({
    model: AI_MODEL_DEFAULT,
    input: [{ role: "user", content: prompt }],
    max_output_tokens: 800,
    store: false,
  });

  const parsed = parseJsonObject(response.output_text);
  const translatedBody = clean(parsed.translated);
  if (!translatedBody) throw new Error("AI could not translate this reply.");

  return {
    body: translatedBody,
    romanUrduBody,
    translated: true,
    clientLanguage: setting.detectedLanguage,
  };
}

export async function cacheOutboundRomanUrdu(
  messageId: string,
  clientId: string,
  romanUrduBody: string,
  clientLanguage: string,
) {
  if (!romanUrduBody) return;
  const { error } = await getSupabase()
    .from("freelance_hq_whatsapp_message_translations")
    .upsert(
      {
        message_id: messageId,
        client_id: clientId,
        roman_urdu: clean(romanUrduBody),
        source_language: clean(clientLanguage, 80),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "message_id" },
    );
  if (error) throw error;
}

export async function explainWhatsAppMessage(
  profile: Profile,
  clientId: string,
  messageId: string,
) {
  await requireClientAccess(profile, clientId);
  const messages = await listWhatsAppMessages(profile, clientId);
  const message = messages.find((item) => item.id === messageId);
  if (!message) throw new Error("Message not found or not accessible.");

  const ensured = await ensureWhatsAppMessageTranslations(profile, clientId, [message]);
  const cached = ensured.translations.get(messageId);
  if (cached?.explanation) return cached.explanation;

  const client = getOpenAiClient();
  const prompt = [
    "Explain this WhatsApp client message to a Pakistani support team in concise Roman Urdu.",
    "Use at most one short paragraph, around 2-4 sentences.",
    "State the likely intent/request clearly. If the wording is ambiguous, say what is unclear instead of inventing facts.",
    "Keep names, amounts, dates, URLs and technical terms unchanged.",
    "",
    "Original message:",
    message.body,
    "",
    "Roman Urdu translation:",
    cached?.romanUrdu || message.body,
  ].join("\n");

  const response = await client.responses.create({
    model: AI_MODEL_DEFAULT,
    input: [{ role: "user", content: prompt }],
    max_output_tokens: 350,
    store: false,
  });
  const explanation = clean(response.output_text, 1800);
  if (!explanation) throw new Error("AI could not explain this message.");

  const { error } = await getSupabase()
    .from("freelance_hq_whatsapp_message_translations")
    .upsert(
      {
        message_id: messageId,
        client_id: clientId,
        roman_urdu: cached?.romanUrdu || message.body,
        source_language: cached?.sourceLanguage || "",
        explanation,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "message_id" },
    );
  if (error) throw error;

  return explanation;
}
