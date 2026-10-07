import { createHash, randomBytes } from "node:crypto";
import { getSupabase } from "./supabaseClient";
import type {
  Profile,
  WhatsAppBridgeHealth,
  WhatsAppChatClient,
  WhatsAppChatMessage,
  WhatsAppClientLink,
} from "./types";

const PAIRING_TTL_MS = 10 * 60 * 1000;
const DEVICE_TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000;
const DEVICE_TOKEN_ROTATE_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_OUTBOX = 20;
const MAX_INBOUND_BATCH = 100;

type BridgeDeviceRow = {
  id: string;
  owner_user_id: string;
  device_id: string;
  extension_install_id: string;
  device_label: string;
  paired_at: string;
  token_expires_at: string;
  last_seen_at: string;
  last_health_at: string | null;
  whatsapp_ready: boolean;
  current_state: "online" | "offline" | "auth_required" | "error";
  last_error: string;
  revoked_at: string | null;
};

export type AuthenticatedWhatsAppBridge = {
  id: string;
  ownerUserId: string;
  deviceId: string;
  extensionInstallId: string;
  deviceLabel: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeText(value: unknown, max = MAX_MESSAGE_LENGTH) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim().slice(0, max);
}

function messageEffectiveTimestamp(row: Record<string, unknown>) {
  const raw = row.remote_timestamp || row.received_at || row.sent_at || row.created_at;
  const time = new Date(String(raw || "")).getTime();
  return Number.isFinite(time) ? time : 0;
}

function parsePairingCode(code: string): { origin: string; rawToken: string } | null {
  const [version, originPart, rawToken] = code.trim().split(".");
  if (version !== "FHQW1" || !originPart || !rawToken) return null;
  try {
    const origin = Buffer.from(originPart, "base64url").toString("utf8");
    const parsed = new URL(origin);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    return { origin: parsed.origin, rawToken };
  } catch {
    return null;
  }
}

async function requireAdminProfile(userId: string) {
  const { data, error } = await getSupabase()
    .from("freelance_hq_profiles")
    .select("id,role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.role !== "admin") throw new Error("Admin access required.");
}

export async function createWhatsAppBridgePairingCode(userId: string, origin: string) {
  await requireAdminProfile(userId);
  const supabase = getSupabase();
  const rawToken = randomBytes(24).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();

  await supabase
    .from("freelance_hq_whatsapp_bridge_pairing_tokens")
    .delete()
    .eq("created_by", userId)
    .is("used_at", null);

  const { error } = await supabase.from("freelance_hq_whatsapp_bridge_pairing_tokens").insert({
    created_by: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;

  const originPart = Buffer.from(new URL(origin).origin, "utf8").toString("base64url");
  return {
    pairingCode: "FHQW1." + originPart + "." + rawToken,
    expiresAt,
  };
}

export async function pairWhatsAppBridge(input: {
  pairingCode: string;
  deviceId: string;
  extensionInstallId: string;
  deviceLabel?: string;
  userAgent?: string;
}) {
  const parsed = parsePairingCode(input.pairingCode);
  if (!parsed) throw new Error("Invalid pairing code.");
  if (!input.deviceId || input.deviceId.length > 160) throw new Error("Invalid device ID.");
  if (!input.extensionInstallId || input.extensionInstallId.length > 160) throw new Error("Invalid install ID.");

  const supabase = getSupabase();
  const usedAt = nowIso();
  const { data: token, error: tokenError } = await supabase
    .from("freelance_hq_whatsapp_bridge_pairing_tokens")
    .update({ used_at: usedAt })
    .eq("token_hash", sha256(parsed.rawToken))
    .is("used_at", null)
    .gt("expires_at", usedAt)
    .select("created_by")
    .maybeSingle();
  if (tokenError) throw tokenError;
  if (!token?.created_by) throw new Error("Pairing code expired or already used.");

  await requireAdminProfile(String(token.created_by));

  const rawDeviceToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawDeviceToken);
  const { data: device, error: deviceError } = await supabase
    .from("freelance_hq_whatsapp_bridge_devices")
    .upsert(
      {
        owner_user_id: token.created_by,
        device_id: input.deviceId,
        extension_install_id: input.extensionInstallId,
        token_hash: tokenHash,
        device_label: sanitizeText(input.deviceLabel, 120),
        user_agent: sanitizeText(input.userAgent, 500),
        paired_at: usedAt,
        token_expires_at: new Date(Date.now() + DEVICE_TOKEN_TTL_MS).toISOString(),
        token_rotated_at: usedAt,
        last_seen_at: usedAt,
        last_health_at: usedAt,
        whatsapp_ready: false,
        current_state: "offline",
        last_error: "",
        revoked_at: null,
        updated_at: usedAt,
      },
      { onConflict: "extension_install_id" },
    )
    .select("id")
    .single();
  if (deviceError) throw deviceError;

  return {
    deviceToken: rawDeviceToken,
    deviceRecordId: String(device.id),
    appOrigin: parsed.origin,
  };
}

export async function authenticateWhatsAppBridge(request: Request): Promise<AuthenticatedWhatsAppBridge> {
  const authorization = request.headers.get("authorization") ?? "";
  const rawToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const installId = (request.headers.get("x-extension-install-id") ?? "").trim();
  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!rawToken || !installId || !deviceId) throw new Error("Unauthorized.");

  const { data, error } = await getSupabase()
    .from("freelance_hq_whatsapp_bridge_devices")
    .select("id,owner_user_id,device_id,extension_install_id,device_label,token_expires_at")
    .eq("token_hash", sha256(rawToken))
    .eq("extension_install_id", installId)
    .eq("device_id", deviceId)
    .is("revoked_at", null)
    .gt("token_expires_at", nowIso())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Unauthorized.");

  return {
    id: String(data.id),
    ownerUserId: String(data.owner_user_id),
    deviceId: String(data.device_id),
    extensionInstallId: String(data.extension_install_id),
    deviceLabel: String(data.device_label ?? ""),
  };
}

export async function updateWhatsAppBridgeHeartbeat(
  device: AuthenticatedWhatsAppBridge,
  input: { whatsappReady?: unknown; state?: unknown; error?: unknown },
) {
  const supabase = getSupabase();
  const currentState = ["online", "offline", "auth_required", "error"].includes(String(input.state))
    ? String(input.state)
    : Boolean(input.whatsappReady)
      ? "online"
      : "offline";
  const now = nowIso();

  const { data: current, error: readError } = await supabase
    .from("freelance_hq_whatsapp_bridge_devices")
    .select("token_expires_at")
    .eq("id", device.id)
    .single();
  if (readError) throw readError;

  const update: Record<string, unknown> = {
    last_seen_at: now,
    last_health_at: now,
    whatsapp_ready: Boolean(input.whatsappReady),
    current_state: currentState,
    last_error: sanitizeText(input.error, 1000),
    updated_at: now,
  };

  let deviceToken: string | null = null;
  const expiresAt = new Date(String(current.token_expires_at)).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() <= DEVICE_TOKEN_ROTATE_BEFORE_MS) {
    deviceToken = randomBytes(32).toString("base64url");
    update.token_hash = sha256(deviceToken);
    update.token_expires_at = new Date(Date.now() + DEVICE_TOKEN_TTL_MS).toISOString();
    update.token_rotated_at = now;
  }

  const { error } = await supabase
    .from("freelance_hq_whatsapp_bridge_devices")
    .update(update)
    .eq("id", device.id)
    .is("revoked_at", null);
  if (error) throw error;

  return { deviceToken };
}

export async function getWhatsAppBridgeHealth(): Promise<WhatsAppBridgeHealth> {
  const { data, error } = await getSupabase()
    .from("freelance_hq_whatsapp_bridge_devices")
    .select("*")
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      state: "not_linked",
      deviceId: null,
      deviceLabel: null,
      whatsappReady: false,
      lastSeenAt: null,
      lastError: null,
    };
  }

  const row = data as BridgeDeviceRow;
  const age = Date.now() - new Date(row.last_seen_at).getTime();
  const expired = new Date(row.token_expires_at).getTime() <= Date.now();
  const state: WhatsAppBridgeHealth["state"] =
    expired || row.current_state === "error" || row.current_state === "auth_required"
      ? "problem"
      : age <= 90_000 && row.whatsapp_ready && row.current_state === "online"
        ? "online"
        : "offline";

  return {
    state,
    deviceId: row.device_id,
    deviceLabel: row.device_label || "Chrome",
    whatsappReady: row.whatsapp_ready,
    lastSeenAt: row.last_seen_at,
    lastError:
      row.current_state === "auth_required"
        ? "WhatsApp Web needs login or QR scan."
        : row.last_error || null,
  };
}

export async function revokeWhatsAppBridgeDevices() {
  const now = nowIso();
  const { error } = await getSupabase()
    .from("freelance_hq_whatsapp_bridge_devices")
    .update({ revoked_at: now, current_state: "offline", whatsapp_ready: false, updated_at: now })
    .is("revoked_at", null);
  if (error) throw error;
}

export async function listWhatsAppClientLinks(): Promise<WhatsAppClientLink[]> {
  const supabase = getSupabase();
  const [{ data: links, error: linkError }, { data: clients, error: clientError }, { data: access, error: accessError }] =
    await Promise.all([
      supabase.from("freelance_hq_whatsapp_client_links").select("*").order("updated_at", { ascending: false }),
      supabase.from("freelance_hq_clients").select("id,name,company,phone"),
      supabase.from("freelance_hq_whatsapp_chat_access").select("client_id,user_id"),
    ]);
  if (linkError) throw linkError;
  if (clientError) throw clientError;
  if (accessError) throw accessError;

  const clientById = new Map((clients ?? []).map((row) => [String(row.id), row]));
  return (links ?? []).map((row) => {
    const client = clientById.get(String(row.client_id));
    return {
      clientId: String(row.client_id),
      clientName: String(client?.name || client?.company || "Client"),
      company: String(client?.company || ""),
      clientPhone: String(client?.phone || ""),
      chatKey: String(row.chat_key || ""),
      chatLabel: String(row.chat_label || ""),
      phone: String(row.phone || ""),
      isEnabled: Boolean(row.is_enabled),
      accessUserIds: (access ?? [])
        .filter((item) => String(item.client_id) === String(row.client_id))
        .map((item) => String(item.user_id)),
    };
  });
}

export async function saveWhatsAppClientLink(input: {
  adminUserId: string;
  clientId: string;
  chatKey: string;
  chatLabel: string;
  phone: string;
  isEnabled: boolean;
  accessUserIds: string[];
}) {
  await requireAdminProfile(input.adminUserId);
  const supabase = getSupabase();
  const now = nowIso();
  const chatKey = sanitizeText(input.chatKey, 240);
  const chatLabel = sanitizeText(input.chatLabel, 240);
  const phone = sanitizeText(input.phone, 80);
  if (!chatKey && !chatLabel && !phone) throw new Error("Choose a WhatsApp chat before saving the mapping.");

  const { error: linkError } = await supabase
    .from("freelance_hq_whatsapp_client_links")
    .upsert(
      {
        client_id: input.clientId,
        chat_key: chatKey,
        chat_label: chatLabel,
        phone,
        is_enabled: Boolean(input.isEnabled),
        created_by: input.adminUserId,
        updated_at: now,
      },
      { onConflict: "client_id" },
    );
  if (linkError) throw linkError;

  const requested = Array.from(new Set(input.accessUserIds.filter(Boolean)));
  const { data: existing, error: existingError } = await supabase
    .from("freelance_hq_whatsapp_chat_access")
    .select("user_id,live_from")
    .eq("client_id", input.clientId);
  if (existingError) throw existingError;

  const existingByUser = new Map((existing ?? []).map((row) => [String(row.user_id), row]));
  const removed = (existing ?? [])
    .map((row) => String(row.user_id))
    .filter((userId) => !requested.includes(userId));

  if (removed.length) {
    const { error } = await supabase
      .from("freelance_hq_whatsapp_chat_access")
      .delete()
      .eq("client_id", input.clientId)
      .in("user_id", removed);
    if (error) throw error;

    const { error: shareError } = await supabase
      .from("freelance_hq_whatsapp_message_shares")
      .delete()
      .eq("client_id", input.clientId)
      .in("user_id", removed);
    if (shareError) throw shareError;
  }

  if (requested.length) {
    const rows = requested.map((userId) => ({
      client_id: input.clientId,
      user_id: userId,
      can_send: true,
      granted_by: input.adminUserId,
      live_from: existingByUser.get(userId)?.live_from || now,
      updated_at: now,
    }));
    const { error } = await supabase
      .from("freelance_hq_whatsapp_chat_access")
      .upsert(rows, { onConflict: "client_id,user_id" });
    if (error) throw error;
  }
}

async function canAccessClient(profile: Profile, clientId: string) {
  if (profile.role === "admin") return { allowed: true, canSend: true, liveFrom: null as string | null };
  const { data, error } = await getSupabase()
    .from("freelance_hq_whatsapp_chat_access")
    .select("can_send,live_from")
    .eq("client_id", clientId)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (error) throw error;
  return {
    allowed: Boolean(data),
    canSend: Boolean(data?.can_send),
    liveFrom: data?.live_from ? String(data.live_from) : null,
  };
}

export async function listAccessibleWhatsAppClients(profile: Profile): Promise<WhatsAppChatClient[]> {
  const supabase = getSupabase();
  let accessRows: Array<{ client_id: unknown; can_send: unknown; live_from: unknown }> = [];
  let allowedClientIds: string[] | null = null;

  if (profile.role !== "admin") {
    const { data: access, error } = await supabase
      .from("freelance_hq_whatsapp_chat_access")
      .select("client_id,can_send,live_from")
      .eq("user_id", profile.id);
    if (error) throw error;
    accessRows = (access ?? []) as typeof accessRows;
    allowedClientIds = accessRows.map((row) => String(row.client_id));
    if (!allowedClientIds.length) return [];
  }

  let linkQuery = supabase
    .from("freelance_hq_whatsapp_client_links")
    .select("client_id,chat_key,chat_label,phone,is_enabled")
    .eq("is_enabled", true);
  if (allowedClientIds) linkQuery = linkQuery.in("client_id", allowedClientIds);

  const [{ data: links, error: linkError }, { data: clients, error: clientError }] = await Promise.all([
    linkQuery,
    supabase.from("freelance_hq_clients").select("id,name,company,phone"),
  ]);
  if (linkError) throw linkError;
  if (clientError) throw clientError;

  const clientById = new Map((clients ?? []).map((row) => [String(row.id), row]));
  const clientIds = (links ?? []).map((row) => String(row.client_id));

  const [{ data: recentMessages, error: messageError }, { data: shares, error: shareError }] = await Promise.all([
    clientIds.length
      ? supabase
          .from("freelance_hq_whatsapp_messages")
          .select("id,client_id,body,created_at,received_at,sent_at,remote_timestamp")
          .in("client_id", clientIds)
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    profile.role !== "admin" && clientIds.length
      ? supabase
          .from("freelance_hq_whatsapp_message_shares")
          .select("message_id,client_id")
          .eq("user_id", profile.id)
          .in("client_id", clientIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (messageError) throw messageError;
  if (shareError) throw shareError;

  const sharedIds = Array.from(new Set((shares ?? []).map((row) => String(row.message_id))));
  const { data: explicitlyShared, error: sharedMessageError } =
    profile.role !== "admin" && sharedIds.length
      ? await supabase
          .from("freelance_hq_whatsapp_messages")
          .select("id,client_id,body,created_at,received_at,sent_at,remote_timestamp")
          .in("id", sharedIds)
      : { data: [], error: null };
  if (sharedMessageError) throw sharedMessageError;

  const messageById = new Map<string, Record<string, unknown>>();
  for (const row of [...(recentMessages ?? []), ...(explicitlyShared ?? [])]) {
    messageById.set(String(row.id), row as Record<string, unknown>);
  }
  const messages = Array.from(messageById.values());
  const sharedIdSet = new Set(sharedIds);
  const accessByClient = new Map(accessRows.map((row) => [String(row.client_id), row]));

  return (links ?? []).map((row) => {
    const clientId = String(row.client_id);
    const client = clientById.get(clientId);
    const access = accessByClient.get(clientId);
    const liveFrom = access?.live_from ? new Date(String(access.live_from)).getTime() : 0;
    const visible = messages
      .filter((message) => {
        if (String(message.client_id) !== clientId) return false;
        if (profile.role === "admin") return true;
        return sharedIdSet.has(String(message.id)) || messageEffectiveTimestamp(message) >= liveFrom;
      })
      .sort((a, b) => messageEffectiveTimestamp(b) - messageEffectiveTimestamp(a));
    const last = visible[0];
    return {
      clientId,
      clientName: String(client?.name || client?.company || row.chat_label || "Client"),
      company: String(client?.company || ""),
      phone: String(row.phone || client?.phone || ""),
      chatKey: String(row.chat_key || ""),
      chatLabel: String(row.chat_label || ""),
      canSend: profile.role === "admin" ? true : Boolean(access?.can_send),
      isEnabled: Boolean(row.is_enabled),
      unreadCount: 0,
      lastMessageAt: last
        ? String(last.remote_timestamp || last.received_at || last.sent_at || last.created_at || "")
        : null,
      lastMessagePreview: last ? sanitizeText(last.body, 120) : "",
    };
  });
}

export async function listWhatsAppMessages(profile: Profile, clientId: string): Promise<WhatsAppChatMessage[]> {
  const access = await canAccessClient(profile, clientId);
  if (!access.allowed) throw new Error("Access denied.");

  const supabase = getSupabase();
  const [{ data: recentRows, error }, { data: profiles, error: profileError }, { data: shares, error: shareError }] = await Promise.all([
    supabase
      .from("freelance_hq_whatsapp_messages")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("freelance_hq_profiles").select("id,name,email"),
    profile.role !== "admin"
      ? supabase
          .from("freelance_hq_whatsapp_message_shares")
          .select("message_id")
          .eq("client_id", clientId)
          .eq("user_id", profile.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (error) throw error;
  if (profileError) throw profileError;
  if (shareError) throw shareError;

  const sharedIds = Array.from(new Set((shares ?? []).map((row) => String(row.message_id))));
  const { data: sharedRows, error: sharedRowsError } =
    profile.role !== "admin" && sharedIds.length
      ? await supabase
          .from("freelance_hq_whatsapp_messages")
          .select("*")
          .eq("client_id", clientId)
          .in("id", sharedIds)
      : { data: [], error: null };
  if (sharedRowsError) throw sharedRowsError;

  const rowById = new Map<string, Record<string, unknown>>();
  for (const row of [...(recentRows ?? []), ...(sharedRows ?? [])]) {
    rowById.set(String(row.id), row as Record<string, unknown>);
  }

  const sharedIdSet = new Set(sharedIds);
  const liveFrom = access.liveFrom ? new Date(access.liveFrom).getTime() : 0;
  const visibleRows = Array.from(rowById.values())
    .filter((row) => {
      if (profile.role === "admin") return true;
      return sharedIdSet.has(String(row.id)) || messageEffectiveTimestamp(row) >= liveFrom;
    })
    .sort((a, b) => messageEffectiveTimestamp(a) - messageEffectiveTimestamp(b));

  const nameById = new Map((profiles ?? []).map((row) => [String(row.id), String(row.name || row.email || "Team")]));

  return visibleRows.map((row) => ({
    id: String(row.id),
    clientId: String(row.client_id),
    direction: row.direction as "inbound" | "outbound",
    body: String(row.body || ""),
    status: row.status as WhatsAppChatMessage["status"],
    senderUserId: row.sender_user_id ? String(row.sender_user_id) : null,
    senderName: row.sender_user_id ? nameById.get(String(row.sender_user_id)) ?? "Team" : null,
    errorText: String(row.error_text || ""),
    createdAt: String(row.created_at),
    sentAt: row.sent_at ? String(row.sent_at) : null,
    receivedAt: row.received_at ? String(row.received_at) : null,
    remoteTimestamp: row.remote_timestamp ? String(row.remote_timestamp) : null,
  }));
}

export async function queueWhatsAppMessage(profile: Profile, clientId: string, bodyRaw: unknown) {
  const access = await canAccessClient(profile, clientId);
  if (!access.allowed || !access.canSend) throw new Error("You cannot send messages to this client.");
  const body = sanitizeText(bodyRaw);
  if (!body) throw new Error("Message cannot be empty.");

  const { data: link, error: linkError } = await getSupabase()
    .from("freelance_hq_whatsapp_client_links")
    .select("is_enabled")
    .eq("client_id", clientId)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link?.is_enabled) throw new Error("WhatsApp chat is not enabled for this client.");

  const { data, error } = await getSupabase()
    .from("freelance_hq_whatsapp_messages")
    .insert({
      client_id: clientId,
      direction: "outbound",
      body,
      status: "queued",
      sender_user_id: profile.id,
      updated_at: nowIso(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: String(data.id) };
}

export async function getBridgeClientConfig(device: AuthenticatedWhatsAppBridge) {
  const { data, error } = await getSupabase()
    .from("freelance_hq_whatsapp_client_links")
    .select("client_id,chat_key,chat_label,phone")
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    clientId: String(row.client_id),
    chatKey: String(row.chat_key || ""),
    chatLabel: String(row.chat_label || ""),
    phone: String(row.phone || ""),
  }));
}

export async function claimWhatsAppOutbox(device: AuthenticatedWhatsAppBridge) {
  const supabase = getSupabase();
  const { data: rows, error } = await supabase
    .from("freelance_hq_whatsapp_messages")
    .select("id,client_id,body,created_at")
    .eq("direction", "outbound")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(MAX_OUTBOX);
  if (error) throw error;
  if (!rows?.length) return [];

  const ids = rows.map((row) => row.id);
  const now = nowIso();
  const { error: claimError } = await supabase
    .from("freelance_hq_whatsapp_messages")
    .update({ status: "sending", bridge_id: device.id, claimed_at: now, updated_at: now })
    .in("id", ids)
    .eq("status", "queued");
  if (claimError) throw claimError;

  const config = await getBridgeClientConfig(device);
  const configByClient = new Map(config.map((item) => [item.clientId, item]));

  return rows
    .map((row) => {
      const target = configByClient.get(String(row.client_id));
      if (!target) return null;
      return {
        id: String(row.id),
        clientId: String(row.client_id),
        body: String(row.body || ""),
        chatKey: target.chatKey,
        chatLabel: target.chatLabel,
        phone: target.phone,
        createdAt: String(row.created_at),
      };
    })
    .filter(Boolean);
}

export async function acknowledgeWhatsAppOutbox(
  device: AuthenticatedWhatsAppBridge,
  input: { id?: unknown; status?: unknown; remoteMessageKey?: unknown; error?: unknown },
) {
  const id = typeof input.id === "string" ? input.id : "";
  const status = input.status === "sent" ? "sent" : input.status === "failed" ? "failed" : null;
  if (!id || !status) throw new Error("Invalid acknowledgement.");

  const now = nowIso();
  const update: Record<string, unknown> = {
    status,
    bridge_id: device.id,
    error_text: status === "failed" ? sanitizeText(input.error, 1000) : "",
    updated_at: now,
  };
  if (status === "sent") update.sent_at = now;
  const remoteKey = sanitizeText(input.remoteMessageKey, 500);
  if (remoteKey) update.remote_message_key = remoteKey;

  const { error } = await getSupabase()
    .from("freelance_hq_whatsapp_messages")
    .update(update)
    .eq("id", id)
    .eq("direction", "outbound")
    .eq("bridge_id", device.id);
  if (error) throw error;
}

export async function ingestWhatsAppInbound(
  device: AuthenticatedWhatsAppBridge,
  rawMessages: unknown,
) {
  if (!Array.isArray(rawMessages)) throw new Error("Messages must be an array.");
  const supabase = getSupabase();
  const config = await getBridgeClientConfig(device);
  const allowedClients = new Set(config.map((item) => item.clientId));
  const rows: Array<Record<string, unknown>> = [];

  for (const raw of rawMessages.slice(0, MAX_INBOUND_BATCH)) {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const clientId = typeof item.clientId === "string" ? item.clientId : "";
    if (!allowedClients.has(clientId)) continue;
    const body = sanitizeText(item.body);
    if (!body) continue;
    const remoteMessageKey = sanitizeText(item.remoteMessageKey, 500);
    if (!remoteMessageKey) continue;
    const receivedAt =
      typeof item.receivedAt === "string" && !Number.isNaN(new Date(item.receivedAt).getTime())
        ? new Date(item.receivedAt).toISOString()
        : nowIso();

    rows.push({
      client_id: clientId,
      direction: "inbound",
      body,
      status: "received",
      bridge_id: device.id,
      remote_message_key: remoteMessageKey,
      remote_timestamp: receivedAt,
      received_at: receivedAt,
      updated_at: nowIso(),
    });
  }

  if (!rows.length) return { inserted: 0 };

  const { data, error } = await supabase
    .from("freelance_hq_whatsapp_messages")
    .upsert(rows, { onConflict: "client_id,remote_message_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return { inserted: data?.length ?? 0 };
}

export async function resetStaleSendingMessages() {
  const threshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { error } = await getSupabase()
    .from("freelance_hq_whatsapp_messages")
    .update({ status: "queued", bridge_id: null, claimed_at: null, updated_at: nowIso() })
    .eq("direction", "outbound")
    .eq("status", "sending")
    .lt("claimed_at", threshold);
  if (error) throw error;
}
