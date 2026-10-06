const FLUSH_ALARM = "fhq-flush";
const HEARTBEAT_ALARM = "fhq-heartbeat";
const SECURITY_HEALTH_ALARM = "fhq-security-health";
const IDLE_SECONDS = 60;
const OFFLINE_GAP_MS = 3 * 60 * 1000;
const MAX_QUEUE = 50;

chrome.idle.setDetectionInterval(IDLE_SECONDS);

async function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

async function storageSet(value) {
  return chrome.storage.local.set(value);
}

async function ensureIdentity() {
  const current = await storageGet(["deviceId", "extensionInstallId"]);
  const next = {};
  if (!current.deviceId) next.deviceId = crypto.randomUUID();
  if (!current.extensionInstallId) next.extensionInstallId = crypto.randomUUID();
  if (Object.keys(next).length) await storageSet(next);
  return { ...current, ...next };
}

async function authState() {
  return storageGet(["appOrigin", "deviceToken", "employee", "deviceId", "extensionInstallId"]);
}

async function apiFetch(path, options = {}) {
  const state = await authState();
  if (!state.appOrigin || !state.deviceToken || !state.extensionInstallId || !state.deviceId) throw new Error("Extension is not paired.");
  const headers = new Headers(options.headers || {});
  headers.set("content-type", "application/json");
  headers.set("authorization", "Bearer " + state.deviceToken);
  headers.set("x-extension-install-id", state.extensionInstallId);
  headers.set("x-device-id", state.deviceId);
  return fetch(state.appOrigin + path, { ...options, headers });
}

function cleanTab(tab) {
  return {
    url: typeof tab?.url === "string" ? tab.url : "",
    pageTitle: typeof tab?.title === "string" ? tab.title : "",
  };
}

async function focusedActiveTab() {
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    if (!win || !win.focused || typeof win.id !== "number") return null;
    const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    return tabs[0] || null;
  } catch {
    return null;
  }
}

async function queueEvent(event) {
  const state = await storageGet(["activityQueue"]);
  const queue = Array.isArray(state.activityQueue) ? state.activityQueue : [];
  queue.push(event);
  if (queue.length > 500) queue.splice(0, queue.length - 500);
  await storageSet({ activityQueue: queue });
  if (queue.length >= MAX_QUEUE) void flushQueues();
}

async function queuePrompt(prompt) {
  const state = await storageGet(["promptQueue"]);
  const queue = Array.isArray(state.promptQueue) ? state.promptQueue : [];
  queue.push(prompt);
  if (queue.length > 100) queue.splice(0, queue.length - 100);
  await storageSet({ promptQueue: queue });
  void flushQueues();
}

async function closeCurrentInterval(endMs, reason) {
  const state = await storageGet(["currentInterval", "sessionId"]);
  const current = state.currentInterval;
  if (!current || !current.startedAt) return;
  const startedMs = new Date(current.startedAt).getTime();
  const safeEndMs = Math.max(startedMs, endMs);
  const seconds = Math.max(0, Math.floor((safeEndMs - startedMs) / 1000));
  if (seconds > 0) {
    await queueEvent({
      sessionId: state.sessionId || null,
      activityType: current.activityType === "idle" ? "idle" : "active",
      url: current.url || "",
      pageTitle: current.pageTitle || "",
      startedAt: current.startedAt,
      endedAt: new Date(safeEndMs).toISOString(),
      durationSeconds: seconds,
      metadata: { reason: reason || "transition" },
    });
  }
  await storageSet({ currentInterval: null });
}

async function ensureSession() {
  const paired = await authState();
  if (!paired.deviceToken) return null;
  const state = await storageGet(["sessionId", "lastHeartbeatAt", "currentInterval"]);
  const now = Date.now();
  const last = state.lastHeartbeatAt ? new Date(state.lastHeartbeatAt).getTime() : 0;
  let sessionId = state.sessionId || null;

  if (sessionId && last && now - last > OFFLINE_GAP_MS) {
    const closeAt = Math.min(now, last + 60000);
    await closeCurrentInterval(closeAt, "heartbeat_timeout");
    await queueEvent({
      sessionId,
      activityType: "session_end",
      url: "",
      pageTitle: "",
      startedAt: new Date(closeAt).toISOString(),
      endedAt: new Date(closeAt).toISOString(),
      durationSeconds: 0,
      metadata: { reason: "offline_timeout" },
    });
    sessionId = null;
  }

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    await storageSet({ sessionId, lastHeartbeatAt: startedAt });
    await queueEvent({
      sessionId,
      activityType: "session_start",
      url: "",
      pageTitle: "",
      startedAt,
      endedAt: null,
      durationSeconds: 0,
      metadata: {},
    });
  }
  return sessionId;
}

async function transition(reason, includeTabSwitch = false) {
  const paired = await authState();
  if (!paired.deviceToken) return;
  const sessionId = await ensureSession();
  const now = Date.now();
  await closeCurrentInterval(now, reason);

  const [idleState, tab] = await Promise.all([
    chrome.idle.queryState(IDLE_SECONDS).catch(() => "active"),
    focusedActiveTab(),
  ]);
  const activityType = idleState === "active" && tab ? "active" : "idle";
  const context = cleanTab(tab);
  const startedAt = new Date(now).toISOString();

  if (includeTabSwitch && tab) {
    await queueEvent({
      sessionId,
      activityType: "tab_switch",
      url: context.url,
      pageTitle: context.pageTitle,
      startedAt,
      endedAt: startedAt,
      durationSeconds: 0,
      metadata: {},
    });
  }

  await storageSet({
    currentInterval: {
      activityType,
      url: context.url,
      pageTitle: context.pageTitle,
      startedAt,
    },
    lastHeartbeatAt: startedAt,
  });
}

async function heartbeat() {
  const paired = await authState();
  if (!paired.deviceToken) return;
  const sessionId = await ensureSession();
  const now = new Date().toISOString();
  const [idleState, tab] = await Promise.all([
    chrome.idle.queryState(IDLE_SECONDS).catch(() => "active"),
    focusedActiveTab(),
  ]);
  const context = cleanTab(tab);
  await queueEvent({
    sessionId,
    activityType: idleState === "active" && tab ? "heartbeat" : "idle",
    url: context.url,
    pageTitle: context.pageTitle,
    startedAt: now,
    endedAt: now,
    durationSeconds: 0,
    metadata: { browserState: idleState },
  });
  await storageSet({ lastHeartbeatAt: now });
  await flushQueues();
}

async function flushQueues() {
  const paired = await authState();
  if (!paired.deviceToken || !paired.appOrigin) return;
  const state = await storageGet(["activityQueue", "promptQueue"]);
  const activityQueue = Array.isArray(state.activityQueue) ? state.activityQueue : [];
  const promptQueue = Array.isArray(state.promptQueue) ? state.promptQueue : [];

  if (activityQueue.length) {
    const batch = activityQueue.slice(0, 100);
    try {
      const response = await apiFetch("/api/extension/activity", {
        method: "POST",
        body: JSON.stringify({ events: batch }),
      });
      if (response.ok) {
        await storageSet({ activityQueue: activityQueue.slice(batch.length) });
      } else if (response.status === 401) {
        await storageSet({ deviceToken: null, employee: null });
      }
    } catch {
      // Keep queue for retry.
    }
  }

  if (promptQueue.length) {
    const batch = promptQueue.slice(0, 20);
    try {
      const response = await apiFetch("/api/extension/prompts", {
        method: "POST",
        body: JSON.stringify({ prompts: batch }),
      });
      if (response.ok) {
        await storageSet({ promptQueue: promptQueue.slice(batch.length) });
      }
    } catch {
      // Keep queue for retry.
    }
  }
}

async function pair(payload) {
  const identity = await ensureIdentity();
  const origin = payload.appOrigin;
  const response = await fetch(origin + "/api/extension/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pairingCode: payload.pairingCode,
      deviceId: identity.deviceId,
      extensionInstallId: identity.extensionInstallId,
      userAgent: navigator.userAgent,
      deviceLabel: payload.deviceLabel || navigator.platform || "Chrome",
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Pairing failed.");
  await storageSet({
    appOrigin: data.appOrigin || origin,
    deviceToken: data.deviceToken,
    employee: data.employee,
    deviceRecordId: data.deviceRecordId,
    sessionId: null,
    currentInterval: null,
    activityQueue: [],
    promptQueue: [],
    lastHeartbeatAt: null,
  });
  await ensureSession();
  await transition("paired");
  await flushQueues();
  return data;
}

async function disconnect() {
  const now = Date.now();
  const state = await storageGet(["sessionId"]);
  await closeCurrentInterval(now, "disconnect");
  if (state.sessionId) {
    await queueEvent({
      sessionId: state.sessionId,
      activityType: "session_end",
      url: "",
      pageTitle: "",
      startedAt: new Date(now).toISOString(),
      endedAt: new Date(now).toISOString(),
      durationSeconds: 0,
      metadata: { reason: "manual_disconnect" },
    });
    await flushQueues();
  }
  await storageSet({
    appOrigin: null,
    deviceToken: null,
    employee: null,
    deviceRecordId: null,
    sessionId: null,
    currentInterval: null,
    lastHeartbeatAt: null,
  });
}

async function lockExtensionStorage() {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch {
    // Older Chromium builds may not support this; extension still remains isolated by origin.
  }
}

async function securityHealthCheck() {
  const current = await authState();
  if (!current.deviceToken) return;
  try {
    const response = await apiFetch("/api/extension/health", { method: "POST", body: "{}" });
    if (response.status === 401) {
      await storageSet({ deviceToken: null, employee: null });
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    if (data.deviceToken) await storageSet({ deviceToken: data.deviceToken });
  } catch {
    // Retry on next scheduled health check.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void lockExtensionStorage();
  void ensureIdentity();
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(SECURITY_HEALTH_ALARM, { periodInMinutes: 360 });
});

chrome.runtime.onStartup.addListener(() => {
  void lockExtensionStorage();
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
  void transition("browser_start");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) void flushQueues();
  if (alarm.name === HEARTBEAT_ALARM) void heartbeat();
  if (alarm.name === SECURITY_HEALTH_ALARM) void securityHealthCheck();
});

chrome.tabs.onActivated.addListener(() => void transition("tab_switch", true));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active) return;
  if (changeInfo.url || changeInfo.title) void transition("tab_update");
});
chrome.windows.onFocusChanged.addListener(() => void transition("window_focus"));
chrome.idle.onStateChanged.addListener(() => void transition("idle_state"));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "PAIR") {
    pair(message)
      .then((data) => sendResponse({ ok: true, employee: data.employee }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Pairing failed." }));
    return true;
  }

  if (message.type === "GET_STATE") {
    Promise.all([authState(), storageGet(["currentInterval", "lastHeartbeatAt"])])
      .then(([auth, state]) => sendResponse({
        ok: true,
        paired: Boolean(auth.deviceToken),
        employee: auth.employee || null,
        appOrigin: auth.appOrigin || null,
        currentInterval: state.currentInterval || null,
        lastHeartbeatAt: state.lastHeartbeatAt || null,
      }));
    return true;
  }

  if (message.type === "DISCONNECT") {
    disconnect()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Disconnect failed." }));
    return true;
  }

  if (message.type === "AI_PROMPT_SUBMITTED") {
    storageGet(["sessionId"])
      .then((state) => queuePrompt({
        platform: message.platform,
        promptText: message.promptText,
        submittedAt: message.submittedAt || new Date().toISOString(),
        sessionId: state.sessionId || null,
      }))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});

void lockExtensionStorage();
void ensureIdentity();
void securityHealthCheck();
void transition("service_worker_awake");
