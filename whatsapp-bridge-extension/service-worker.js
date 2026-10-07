const CONFIG_REFRESH_MS = 30000;
const HEARTBEAT_MS = 30000;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(value) {
  return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

async function ensureIdentity() {
  const state = await storageGet(["deviceId", "extensionInstallId"]);
  const next = {};
  if (!state.deviceId) next.deviceId = crypto.randomUUID();
  if (!state.extensionInstallId) next.extensionInstallId = crypto.randomUUID();
  if (Object.keys(next).length) await storageSet(next);
  return { deviceId: state.deviceId || next.deviceId, extensionInstallId: state.extensionInstallId || next.extensionInstallId };
}

async function authState() {
  return storageGet(["appOrigin", "deviceToken", "deviceId", "extensionInstallId", "deviceLabel"]);
}

async function apiFetch(path, options = {}) {
  const state = await authState();
  if (!state.appOrigin || !state.deviceToken) throw new Error("Bridge is not paired.");
  const headers = new Headers(options.headers || {});
  headers.set("authorization", "Bearer " + state.deviceToken);
  headers.set("x-device-id", state.deviceId || "");
  headers.set("x-extension-install-id", state.extensionInstallId || "");
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(state.appOrigin + path, { ...options, headers });
}

async function pair(payload) {
  const identity = await ensureIdentity();
  const response = await fetch(payload.appOrigin + "/api/whatsapp-bridge/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pairingCode: payload.pairingCode,
      deviceId: identity.deviceId,
      extensionInstallId: identity.extensionInstallId,
      deviceLabel: payload.deviceLabel || navigator.platform || "WhatsApp Bridge Chrome",
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Pairing failed.");
  await storageSet({
    appOrigin: data.appOrigin || payload.appOrigin,
    deviceToken: data.deviceToken,
    deviceRecordId: data.deviceRecordId,
    deviceLabel: payload.deviceLabel || navigator.platform || "WhatsApp Bridge Chrome",
    bridgeConfig: [],
    lastConfigAt: 0,
    lastHeartbeatAt: 0,
  });
  return data;
}

async function heartbeat(whatsappReady, state = "online", error = "") {
  const response = await apiFetch("/api/whatsapp-bridge/heartbeat", {
    method: "POST",
    body: JSON.stringify({ whatsappReady, state, error }),
  });
  if (response.status === 401) {
    await storageSet({ deviceToken: null });
    return false;
  }
  if (!response.ok) return false;
  const data = await response.json();
  if (data.deviceToken) await storageSet({ deviceToken: data.deviceToken });
  await storageSet({ lastHeartbeatAt: Date.now() });
  return true;
}

async function loadConfig(force = false) {
  const state = await storageGet(["bridgeConfig", "lastConfigAt"]);
  if (!force && Array.isArray(state.bridgeConfig) && Date.now() - Number(state.lastConfigAt || 0) < CONFIG_REFRESH_MS) {
    return state.bridgeConfig;
  }
  const response = await apiFetch("/api/whatsapp-bridge/config", { method: "GET" });
  if (!response.ok) return Array.isArray(state.bridgeConfig) ? state.bridgeConfig : [];
  const data = await response.json();
  const clients = Array.isArray(data.clients) ? data.clients : [];
  await storageSet({ bridgeConfig: clients, lastConfigAt: Date.now() });
  return clients;
}

async function acknowledge(message, status, remoteMessageKey = "", error = "") {
  try {
    await apiFetch("/api/whatsapp-bridge/ack", {
      method: "POST",
      body: JSON.stringify({ id: message.id, status, remoteMessageKey, error }),
    });
  } catch {
    // A stale "sending" item is automatically returned to the queue server-side.
  }
}

async function processOutbox(tabId) {
  const response = await apiFetch("/api/whatsapp-bridge/outbox", { method: "GET" });
  if (!response.ok) return;
  const data = await response.json();
  const messages = Array.isArray(data.messages) ? data.messages : [];
  for (const message of messages) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "WA_SEND_MESSAGE", message });
      if (result?.ok) {
        await acknowledge(message, "sent", result.remoteMessageKey || ("outbound:" + message.id), "");
      } else {
        await acknowledge(message, "failed", "", result?.error || "WhatsApp Web could not send this message.");
      }
    } catch (error) {
      await acknowledge(message, "failed", "", error?.message || "WhatsApp tab unavailable.");
    }
  }
}

let tickRunning = false;
async function bridgeTick(tabId, whatsappReady) {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const state = await authState();
    if (!state.deviceToken) return;

    const stored = await storageGet(["lastHeartbeatAt"]);
    if (Date.now() - Number(stored.lastHeartbeatAt || 0) >= HEARTBEAT_MS) {
      await heartbeat(Boolean(whatsappReady), whatsappReady ? "online" : "auth_required", whatsappReady ? "" : "WhatsApp Web is not logged in.");
    }

    if (!whatsappReady) return;
    const config = await loadConfig(false);
    try {
      await chrome.tabs.sendMessage(tabId, { type: "WA_CONFIG", clients: config });
    } catch {
      return;
    }
    await processOutbox(tabId);
  } finally {
    tickRunning = false;
  }
}

async function uploadInbound(messages) {
  if (!Array.isArray(messages) || !messages.length) return;
  await apiFetch("/api/whatsapp-bridge/inbound", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

async function disconnect() {
  await storageSet({
    appOrigin: null,
    deviceToken: null,
    deviceRecordId: null,
    bridgeConfig: [],
    lastConfigAt: 0,
    lastHeartbeatAt: 0,
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
  void ensureIdentity();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "PAIR") {
    pair(message)
      .then((data) => sendResponse({ ok: true, deviceRecordId: data.deviceRecordId }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Pairing failed." }));
    return true;
  }

  if (message.type === "GET_STATE") {
    Promise.all([authState(), storageGet(["bridgeConfig", "lastHeartbeatAt"])])
      .then(([auth, state]) => sendResponse({
        ok: true,
        paired: Boolean(auth.deviceToken),
        appOrigin: auth.appOrigin || null,
        deviceLabel: auth.deviceLabel || null,
        clientCount: Array.isArray(state.bridgeConfig) ? state.bridgeConfig.length : 0,
        lastHeartbeatAt: state.lastHeartbeatAt || 0,
      }));
    return true;
  }

  if (message.type === "DISCONNECT") {
    disconnect().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "BRIDGE_TICK" && sender.tab?.id) {
    bridgeTick(sender.tab.id, message.whatsappReady === true)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Bridge tick failed." }));
    return true;
  }

  if (message.type === "WA_INBOUND_BATCH") {
    uploadInbound(message.messages)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Inbound sync failed." }));
    return true;
  }

  return false;
});

void ensureIdentity();
