const CONFIG_REFRESH_MS = 30000;
const HEARTBEAT_MS = 30000;
const FAST_POLL_MS = 1000;
const KEEPALIVE_MS = 20000;

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
  return {
    deviceId: state.deviceId || next.deviceId,
    extensionInstallId: state.extensionInstallId || next.extensionInstallId,
  };
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
  const contentType = response.headers.get("content-type") || "";
  let data = null;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    const preview = text.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(
      "Pairing API returned a web page instead of JSON. Generate a fresh pairing code from the live production app." +
      (preview ? " Response: " + preview : "")
    );
  }
  if (!response.ok) throw new Error(data?.error || "Pairing failed.");
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
    // Stale "sending" items are returned to the queue server-side.
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

async function completeRemoteRequest(id, ok, result = null, error = "") {
  await apiFetch("/api/whatsapp-bridge/requests", {
    method: "POST",
    body: JSON.stringify({ id, ok, result, error }),
  });
}

async function processRemoteRequest(tabId) {
  const response = await apiFetch("/api/whatsapp-bridge/requests", { method: "GET" });
  if (!response.ok) return;
  const data = await response.json();
  const request = data.request;
  if (!request?.id) return;

  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: "WA_BRIDGE_REQUEST", request });
    if (result?.ok) {
      await completeRemoteRequest(request.id, true, result.result || {});
    } else {
      await completeRemoteRequest(request.id, false, null, result?.error || "WhatsApp request failed.");
    }
  } catch (error) {
    await completeRemoteRequest(request.id, false, null, error?.message || "WhatsApp tab unavailable.");
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
      await heartbeat(
        Boolean(whatsappReady),
        whatsappReady ? "online" : "auth_required",
        whatsappReady ? "" : "WhatsApp Web is not logged in.",
      );
    }

    if (!whatsappReady) return;

    // Outbox delivery is the critical path for team messages. Process it first
    // so a temporary config refresh or admin remote-request failure cannot block
    // queued team messages from being sent.
    try {
      await processOutbox(tabId);
    } catch (error) {
      await heartbeat(true, "problem", error?.message || "WhatsApp outbox processing failed.");
    }

    try {
      const config = await loadConfig(false);
      await chrome.tabs.sendMessage(tabId, { type: "WA_CONFIG", clients: config });
      // Chrome throttles background-tab timers. Trigger inbound sync from the
      // service worker so new WhatsApp text/voice reaches the app promptly.
      await chrome.tabs.sendMessage(tabId, { type: "WA_SYNC_NOW" });
    } catch {
      // Keep outbox delivery working even if config refresh/content messaging fails.
    }

    try {
      await processRemoteRequest(tabId);
    } catch {
      // A failed admin bridge request must not block the next outbox tick.
    }
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

async function uploadInboundAudio(audio) {
  if (!audio || typeof audio !== "object") throw new Error("Voice note data is missing.");
  const response = await apiFetch("/api/whatsapp-bridge/audio", {
    method: "POST",
    body: JSON.stringify(audio),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Voice note processing failed.");
  return data;
}

async function reportInboundAudioFailure(audio) {
  if (!audio || typeof audio !== "object") return;
  try {
    await apiFetch("/api/whatsapp-bridge/audio/failure", {
      method: "POST",
      body: JSON.stringify(audio),
    });
  } catch {
    // Diagnostic reporting must never affect normal bridge traffic.
  }
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

let fastPollRunning = false;

async function fastBridgePoll() {
  if (fastPollRunning) return;
  fastPollRunning = true;
  try {
    const state = await authState();
    if (!state.deviceToken) return;

    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    const tab = tabs.find((item) => item.active) || tabs[0];
    if (!tab?.id) return;

    let ready = false;
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: "WA_READY_CHECK" });
      ready = result?.ready === true;
    } catch {
      ready = false;
    }

    if (ready) {
      await bridgeTick(tab.id, true);
    }
  } finally {
    fastPollRunning = false;
  }
}

function startFastPolling() {
  // Content-script timers are throttled by Chrome when WhatsApp Web sits in a
  // background tab, which caused bridge requests to be picked up only on the
  // next minute boundary. Poll from the extension worker instead.
  setInterval(() => {
    void fastBridgePoll();
  }, FAST_POLL_MS);

  // Keep this private bridge worker alive while Chrome is running so the
  // one-second poll is not suspended with the background WhatsApp tab.
  setInterval(() => {
    void chrome.runtime.getPlatformInfo().catch(() => {});
  }, KEEPALIVE_MS);

  void fastBridgePoll();
}

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    try {
      if (chrome.storage.local.setAccessLevel) {
        await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
      }
    } catch {
      // Older Chromium builds may not support storage access levels.
    }
    await ensureIdentity();
  })();
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

  if (message.type === "WA_AUDIO_INBOUND") {
    uploadInboundAudio(message.audio)
      .then((data) => sendResponse({ ok: true, result: data }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Voice note processing failed." }));
    return true;
  }

  if (message.type === "WA_AUDIO_FAILURE") {
    reportInboundAudioFailure(message.audio)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

void ensureIdentity();
startFastPolling();
