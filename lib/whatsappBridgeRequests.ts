import { getSupabase } from "./supabaseClient";
import type { AuthenticatedWhatsAppBridge } from "./whatsappBridge";

const REQUEST_TTL_MS = 10 * 60 * 1000;
const PROCESSING_STALE_MS = 2 * 60 * 1000;
const MAX_RESULT_MESSAGES = 1000;

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim().slice(0, max);
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

async function requireAdmin(userId: string) {
  const { data, error } = await getSupabase()
    .from("freelance_hq_profiles")
    .select("id,role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.role !== "admin") throw new Error("Admin access required.");
}

export type BridgeRequestType = "scan" | "list_chats" | "history" | "direct_send";

export async function createAdminWhatsAppRequest(
  adminUserId: string,
  input: {
    requestType: BridgeRequestType;
    query?: unknown;
    chatKey?: unknown;
    chatLabel?: unknown;
    phone?: unknown;
    clientId?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
    payload?: Record<string, unknown>;
  },
) {
  await requireAdmin(adminUserId);
  const requestType = input.requestType;
  const query = clean(input.query, 240);
  const chatKey = clean(input.chatKey, 300);
  const chatLabel = clean(input.chatLabel, 240);
  const phone = clean(input.phone, 80);
  const clientId = typeof input.clientId === "string" && input.clientId ? input.clientId : null;
  const dateFrom = validDate(input.dateFrom);
  const dateTo = validDate(input.dateTo);

  if (requestType === "scan" && !query) throw new Error("Enter a WhatsApp name to scan.");
  if ((requestType === "history" || requestType === "direct_send") && !chatKey && !chatLabel && !phone) {
    throw new Error("Choose a WhatsApp chat first.");
  }
  if (requestType === "direct_send" && !clean(input.payload?.body, 5000)) {
    throw new Error("Message cannot be empty.");
  }

  const now = nowIso();
  const { data, error } = await getSupabase()
    .from("freelance_hq_whatsapp_bridge_requests")
    .insert({
      created_by: adminUserId,
      request_type: requestType,
      query,
      chat_key: chatKey,
      chat_label: chatLabel,
      phone,
      client_id: clientId,
      date_from: dateFrom,
      date_to: dateTo,
      payload: input.payload ?? {},
      status: "queued",
      expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
      updated_at: now,
    })
    .select("id,status,created_at,expires_at")
    .single();
  if (error) throw error;
  return {
    id: String(data.id),
    status: String(data.status),
    createdAt: String(data.created_at),
    expiresAt: String(data.expires_at),
  };
}

export async function getAdminWhatsAppRequest(adminUserId: string, requestId: string) {
  await requireAdmin(adminUserId);
  const { data, error } = await getSupabase()
    .from("freelance_hq_whatsapp_bridge_requests")
    .select("id,request_type,status,result,error_text,created_at,updated_at,completed_at,expires_at")
    .eq("id", requestId)
    .eq("created_by", adminUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Request not found.");
  return {
    id: String(data.id),
    requestType: String(data.request_type),
    status: String(data.status),
    result: data.result ?? null,
    error: String(data.error_text || ""),
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
    completedAt: data.completed_at ? String(data.completed_at) : null,
    expiresAt: String(data.expires_at),
  };
}

export async function claimWhatsAppBridgeRequest(device: AuthenticatedWhatsAppBridge) {
  const supabase = getSupabase();
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS).toISOString();

  await supabase
    .from("freelance_hq_whatsapp_bridge_requests")
    .update({
      status: "queued",
      claimed_by: null,
      claimed_at: null,
      updated_at: nowIso(),
    })
    .eq("status", "processing")
    .lt("claimed_at", staleBefore)
    .gt("expires_at", nowIso());

  const { data: row, error } = await supabase
    .from("freelance_hq_whatsapp_bridge_requests")
    .select("*")
    .eq("status", "queued")
    .gt("expires_at", nowIso())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const claimedAt = nowIso();
  const { data: claimed, error: claimError } = await supabase
    .from("freelance_hq_whatsapp_bridge_requests")
    .update({
      status: "processing",
      claimed_by: device.id,
      claimed_at: claimedAt,
      updated_at: claimedAt,
    })
    .eq("id", row.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return null;

  return {
    id: String(claimed.id),
    requestType: String(claimed.request_type),
    query: String(claimed.query || ""),
    chatKey: String(claimed.chat_key || ""),
    chatLabel: String(claimed.chat_label || ""),
    phone: String(claimed.phone || ""),
    clientId: claimed.client_id ? String(claimed.client_id) : null,
    dateFrom: claimed.date_from ? String(claimed.date_from) : null,
    dateTo: claimed.date_to ? String(claimed.date_to) : null,
    payload: claimed.payload ?? {},
  };
}

async function ingestHistoryResult(
  device: AuthenticatedWhatsAppBridge,
  request: { client_id?: string | null },
  result: unknown,
) {
  const clientId = request.client_id ? String(request.client_id) : "";
  if (!clientId || !result || typeof result !== "object") return;

  const rawMessages = Array.isArray((result as { messages?: unknown }).messages)
    ? ((result as { messages: unknown[] }).messages)
    : [];
  if (!rawMessages.length) return;

  const rows: Array<Record<string, unknown>> = [];
  for (const raw of rawMessages.slice(0, MAX_RESULT_MESSAGES)) {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const body = clean(item.body, 5000);
    const remoteMessageKey = clean(item.remoteMessageKey, 500);
    const direction = item.direction === "outbound" ? "outbound" : "inbound";
    const remoteTimestamp = validDate(item.remoteTimestamp) || nowIso();
    if (!body || !remoteMessageKey) continue;

    rows.push({
      client_id: clientId,
      direction,
      body,
      status: direction === "outbound" ? "sent" : "received",
      bridge_id: device.id,
      remote_message_key: remoteMessageKey,
      remote_timestamp: remoteTimestamp,
      received_at: direction === "inbound" ? remoteTimestamp : null,
      sent_at: direction === "outbound" ? remoteTimestamp : null,
      created_at: remoteTimestamp,
      updated_at: nowIso(),
    });
  }
  if (!rows.length) return;

  const { error } = await getSupabase()
    .from("freelance_hq_whatsapp_messages")
    .upsert(rows, { onConflict: "client_id,remote_message_key", ignoreDuplicates: true });
  if (error) throw error;
}

export async function completeWhatsAppBridgeRequest(
  device: AuthenticatedWhatsAppBridge,
  input: { id?: unknown; ok?: unknown; result?: unknown; error?: unknown },
) {
  const id = typeof input.id === "string" ? input.id : "";
  if (!id) throw new Error("Invalid request.");

  const supabase = getSupabase();
  const { data: request, error: readError } = await supabase
    .from("freelance_hq_whatsapp_bridge_requests")
    .select("id,request_type,client_id,status,claimed_by")
    .eq("id", id)
    .eq("claimed_by", device.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!request || request.status !== "processing") throw new Error("Request is no longer active.");

  const ok = input.ok === true;
  const result = input.result && typeof input.result === "object" ? input.result : {};
  if (ok && request.request_type === "history") {
    await ingestHistoryResult(device, request, result);
  }

  const now = nowIso();
  const { error } = await supabase
    .from("freelance_hq_whatsapp_bridge_requests")
    .update({
      status: ok ? "done" : "failed",
      result: ok ? result : null,
      error_text: ok ? "" : clean(input.error, 1000),
      completed_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("claimed_by", device.id);
  if (error) throw error;
}

export async function removeWhatsAppClientMapping(adminUserId: string, clientId: string) {
  await requireAdmin(adminUserId);
  if (!clientId) throw new Error("Client is required.");
  const supabase = getSupabase();
  const { error: accessError } = await supabase
    .from("freelance_hq_whatsapp_chat_access")
    .delete()
    .eq("client_id", clientId);
  if (accessError) throw accessError;

  const { error: shareError } = await supabase
    .from("freelance_hq_whatsapp_message_shares")
    .delete()
    .eq("client_id", clientId);
  if (shareError) throw shareError;

  const { error: linkError } = await supabase
    .from("freelance_hq_whatsapp_client_links")
    .delete()
    .eq("client_id", clientId);
  if (linkError) throw linkError;
}

export async function shareWhatsAppHistory(
  adminUserId: string,
  input: {
    clientId: string;
    userId: string;
    messageIds?: string[];
    remoteMessageKeys?: string[];
    dateFrom?: string | null;
    dateTo?: string | null;
  },
) {
  await requireAdmin(adminUserId);
  const clientId = String(input.clientId || "");
  const userId = String(input.userId || "");
  if (!clientId || !userId) throw new Error("Client and team member are required.");

  const supabase = getSupabase();
  const { data: access, error: accessError } = await supabase
    .from("freelance_hq_whatsapp_chat_access")
    .select("client_id,user_id")
    .eq("client_id", clientId)
    .eq("user_id", userId)
    .maybeSingle();
  if (accessError) throw accessError;
  if (!access) throw new Error("Give this team member chat access first.");

  let query = supabase
    .from("freelance_hq_whatsapp_messages")
    .select("id")
    .eq("client_id", clientId);

  const messageIds = Array.from(new Set((input.messageIds ?? []).filter(Boolean)));
  const remoteKeys = Array.from(new Set((input.remoteMessageKeys ?? []).filter(Boolean)));
  const from = validDate(input.dateFrom);
  const to = validDate(input.dateTo);

  if (messageIds.length) {
    query = query.in("id", messageIds);
  } else if (remoteKeys.length) {
    query = query.in("remote_message_key", remoteKeys);
  } else if (from && to) {
    query = query.gte("created_at", from).lt("created_at", to);
  } else {
    throw new Error("Select messages, a full day, or a date range to share.");
  }

  const { data: messages, error: messageError } = await query.limit(1000);
  if (messageError) throw messageError;
  if (!messages?.length) return { shared: 0 };

  const now = nowIso();
  const rows = messages.map((message) => ({
    message_id: message.id,
    client_id: clientId,
    user_id: userId,
    shared_by: adminUserId,
    created_at: now,
  }));
  const { error } = await supabase
    .from("freelance_hq_whatsapp_message_shares")
    .upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
  return { shared: rows.length };
}

export async function revokeWhatsAppSharedHistory(adminUserId: string, clientId: string, userId: string) {
  await requireAdmin(adminUserId);
  const { error } = await getSupabase()
    .from("freelance_hq_whatsapp_message_shares")
    .delete()
    .eq("client_id", clientId)
    .eq("user_id", userId);
  if (error) throw error;
}
