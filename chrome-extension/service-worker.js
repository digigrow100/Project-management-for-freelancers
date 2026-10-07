const FLUSH_ALARM = "fhq-flush";
const HEARTBEAT_ALARM = "fhq-heartbeat";
const SECURITY_HEALTH_ALARM = "fhq-security-health";
const IDLE_SECONDS = 60;
const OFFLINE_GAP_MS = 3 * 60 * 1000;
const MAX_QUEUE = 50;
const AI_OFFLINE_ALARM = "fhq-ai-offline";
const AI_STOP_GRACE_MS = 60 * 1000;

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

async function beginWorkSession(startedAt) {
  const sessionId = crypto.randomUUID();
  await storageSet({
    sessionId,
    workStarted: true,
    lastHeartbeatAt: startedAt,
  });
  await queueEvent({
    sessionId,
    activityType: "session_start",
    url: "",
    pageTitle: "",
    startedAt,
    endedAt: null,
    durationSeconds: 0,
    metadata: { reason: "first_meaningful_browser_work" },
  });
  return sessionId;
}

async function ensureWaitingInterval() {
  const paired = await authState();
  if (!paired.deviceToken) return;
  const state = await storageGet(["workStarted", "currentInterval"]);
  if (state.workStarted || state.currentInterval) return;
  const tab = await focusedActiveTab();
  const context = cleanTab(tab);
  const startedAt = new Date().toISOString();
  await storageSet({
    currentInterval: {
      activityType: "idle",
      url: context.url,
      pageTitle: context.pageTitle,
      startedAt,
    },
    lastHeartbeatAt: startedAt,
  });
}

async function transition(reason, includeTabSwitch = false, allowWorkStart = false) {
  const paired = await authState();
  if (!paired.deviceToken) return;

  if (allowWorkStart) {
    await chrome.alarms.clear(AI_OFFLINE_ALARM);
    await storageSet({ aiGraceUntil: null });
  }

  const now = Date.now();
  const state = await storageGet(["workStarted", "sessionId", "startupGraceUntil", "aiGenerating"]);
  let workStarted = state.workStarted === true;
  let sessionId = state.sessionId || null;

  if (!workStarted) {
    const graceUntil = Number(state.startupGraceUntil || 0);
    if (!allowWorkStart || (reason !== "ai_prompt" && now < graceUntil)) {
      await ensureWaitingInterval();
      return;
    }

    await closeCurrentInterval(now, "work_started");
    sessionId = await beginWorkSession(new Date(now).toISOString());
    workStarted = true;
  } else {
    await closeCurrentInterval(now, reason);
  }

  const [idleState, tab] = await Promise.all([
    chrome.idle.queryState(IDLE_SECONDS).catch(() => "active"),
    focusedActiveTab(),
  ]);
  const activityType = state.aiGenerating === true ? "active" : idleState === "active" && tab ? "active" : "idle";
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

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const state = await storageGet(["workStarted", "sessionId", "aiGenerating", "aiGraceUntil"]);
  const workStarted = state.workStarted === true;
  const sessionId = workStarted ? state.sessionId || null : null;
  const aiGenerating = state.aiGenerating === true;
  const aiGraceUntil = Number(state.aiGraceUntil || 0);

  await closeCurrentInterval(nowMs, "heartbeat_checkpoint");

  const [idleState, tab] = await Promise.all([
    chrome.idle.queryState(IDLE_SECONDS).catch(() => "active"),
    focusedActiveTab(),
  ]);
  const context = cleanTab(tab);

  if (!aiGenerating && aiGraceUntil > 0 && nowMs >= aiGraceUntil) {
    await storageSet({
      currentInterval: null,
      workStarted: false,
      sessionId: null,
      aiGraceUntil: null,
      lastHeartbeatAt: now,
    });
    await queueEvent({
      sessionId,
      activityType: "offline",
      url: context.url,
      pageTitle: context.pageTitle,
      startedAt: now,
      endedAt: now,
      durationSeconds: 0,
      metadata: { reason: "ai_completed_inactive_60s" },
    });
    if (sessionId) {
      await queueEvent({
        sessionId,
        activityType: "session_end",
        url: "",
        pageTitle: "",
        startedAt: now,
        endedAt: now,
        durationSeconds: 0,
        metadata: { reason: "ai_completed_inactive_60s" },
      });
    }
    await flushQueues();
    return;
  }

  const activityType = aiGenerating
    ? "active"
    : workStarted && idleState === "active" && tab
      ? "active"
      : "idle";

  await storageSet({
    currentInterval: {
      activityType,
      url: context.url,
      pageTitle: context.pageTitle,
      startedAt: now,
    },
    lastHeartbeatAt: now,
  });

  await queueEvent({
    sessionId,
    activityType: workStarted && activityType === "active" ? "heartbeat" : "idle",
    url: context.url,
    pageTitle: context.pageTitle,
    startedAt: now,
    endedAt: now,
    durationSeconds: 0,
    metadata: { browserState: idleState, workStarted, aiGenerating },
  });

  await flushQueues();
}

async function setAiGenerationState(platform, generating) {
  const paired = await authState();
  if (!paired.deviceToken) return;

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const current = await storageGet(["aiGenerating", "workStarted", "sessionId"]);

  if (generating) {
    if (current.aiGenerating === true) return;
    await chrome.alarms.clear(AI_OFFLINE_ALARM);
    await closeCurrentInterval(nowMs, "ai_generation_started");

    let sessionId = current.sessionId || null;
    if (!current.workStarted || !sessionId) {
      sessionId = await beginWorkSession(now);
    }

    const tab = await focusedActiveTab();
    const context = cleanTab(tab);
    await storageSet({
      aiGenerating: true,
      aiPlatform: platform,
      aiGraceUntil: null,
      workStarted: true,
      sessionId,
      currentInterval: {
        activityType: "active",
        url: context.url,
        pageTitle: context.pageTitle,
        startedAt: now,
      },
      lastHeartbeatAt: now,
    });

    await queueEvent({
      sessionId,
      activityType: "heartbeat",
      url: context.url,
      pageTitle: context.pageTitle,
      startedAt: now,
      endedAt: now,
      durationSeconds: 0,
      metadata: { reason: "ai_generation_started", platform },
    });
    await flushQueues();
    return;
  }

  if (current.aiGenerating !== true) return;

  const graceUntil = nowMs + AI_STOP_GRACE_MS;
  await storageSet({
    aiGenerating: false,
    aiPlatform: platform,
    aiGraceUntil: graceUntil,
    lastHeartbeatAt: now,
  });
  await chrome.alarms.create(AI_OFFLINE_ALARM, { when: graceUntil });
}

async function markAiInactiveOffline() {
  const paired = await authState();
  if (!paired.deviceToken) return;
  const state = await storageGet(["aiGenerating", "aiGraceUntil", "sessionId"]);
  if (state.aiGenerating === true) return;

  const graceUntil = Number(state.aiGraceUntil || 0);
  const nowMs = Date.now();
  if (!graceUntil || nowMs < graceUntil) return;

  const now = new Date(nowMs).toISOString();
  await closeCurrentInterval(nowMs, "ai_completed_inactive_60s");
  const tab = await focusedActiveTab();
  const context = cleanTab(tab);
  const sessionId = state.sessionId || null;

  await queueEvent({
    sessionId,
    activityType: "offline",
    url: context.url,
    pageTitle: context.pageTitle,
    startedAt: now,
    endedAt: now,
    durationSeconds: 0,
    metadata: { reason: "ai_completed_inactive_60s" },
  });
  if (sessionId) {
    await queueEvent({
      sessionId,
      activityType: "session_end",
      url: "",
      pageTitle: "",
      startedAt: now,
      endedAt: now,
      durationSeconds: 0,
      metadata: { reason: "ai_completed_inactive_60s" },
    });
  }

  await storageSet({
    aiGraceUntil: null,
    workStarted: false,
    sessionId: null,
    currentInterval: null,
    lastHeartbeatAt: now,
  });
  await flushQueues();
}

async function resetBrowserTracking() {
  const paired = await authState();
  if (!paired.deviceToken) return;

  const nowMs = Date.now();
  const state = await storageGet(["sessionId", "lastHeartbeatAt", "workStarted"]);
  if (state.workStarted && state.sessionId) {
    const lastMs = state.lastHeartbeatAt ? new Date(state.lastHeartbeatAt).getTime() : nowMs;
    const closeAt = Math.min(nowMs, lastMs + 60000);
    await closeCurrentInterval(closeAt, "browser_restart");
    await queueEvent({
      sessionId: state.sessionId,
      activityType: "session_end",
      url: "",
      pageTitle: "",
      startedAt: new Date(closeAt).toISOString(),
      endedAt: new Date(closeAt).toISOString(),
      durationSeconds: 0,
      metadata: { reason: "browser_restart" },
    });
  } else {
    await closeCurrentInterval(nowMs, "browser_restart");
  }

  await storageSet({
    sessionId: null,
    workStarted: false,
    currentInterval: null,
    startupGraceUntil: nowMs + 5000,
    lastHeartbeatAt: new Date(nowMs).toISOString(),
  });
  await ensureWaitingInterval();
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
    workStarted: false,
    currentInterval: null,
    startupGraceUntil: Date.now() + 1000,
    aiGenerating: false,
    aiPlatform: null,
    aiGraceUntil: null,
    activityQueue: [],
    promptQueue: [],
    lastHeartbeatAt: new Date().toISOString(),
  });
  await ensureWaitingInterval();
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
    workStarted: false,
    currentInterval: null,
    startupGraceUntil: null,
    aiGenerating: false,
    aiPlatform: null,
    aiGraceUntil: null,
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
  chrome.alarms.create(SECURITY_HEALTH_ALARM, { periodInMinutes: 360 });
  void resetBrowserTracking();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) void flushQueues();
  if (alarm.name === HEARTBEAT_ALARM) void heartbeat();
  if (alarm.name === AI_OFFLINE_ALARM) void markAiInactiveOffline();
  if (alarm.name === SECURITY_HEALTH_ALARM) void securityHealthCheck();
});

chrome.tabs.onActivated.addListener(() => void transition("tab_switch", true, true));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active || !changeInfo.url) return;
  void transition("navigation", false, true);
});
chrome.windows.onFocusChanged.addListener(() => void transition("window_focus", false, false));
chrome.idle.onStateChanged.addListener(() => void transition("idle_state", false, false));

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

  if (message.type === "AI_GENERATION_STATE") {
    setAiGenerationState(message.platform, message.generating === true)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "AI_PROMPT_SUBMITTED") {
    chrome.alarms.clear(AI_OFFLINE_ALARM);
    storageSet({ aiGraceUntil: null });
    transition("ai_prompt", false, true)
      .then(() => storageGet(["sessionId"]))
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
void ensureWaitingInterval();
