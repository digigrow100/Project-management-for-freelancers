(() => {
  let clients = [];
  let cycleIndex = 0;
  let busy = false;
  let lastSyncAt = 0;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function whatsappReady() {
    return Boolean(
      document.querySelector("#pane-side") ||
      document.querySelector('[data-testid="chat-list"]') ||
      document.querySelector('[aria-label*="Chat list"]')
    );
  }

  function searchBox() {
    const selectors = [
      '[data-testid="chat-list-search"] div[contenteditable="true"]',
      'div[contenteditable="true"][data-tab="3"]',
      'div[contenteditable="true"][role="textbox"][aria-placeholder*="Search"]',
      'div[contenteditable="true"][role="textbox"][title*="Search"]',
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    const boxes = Array.from(document.querySelectorAll('div[contenteditable="true"][role="textbox"]'));
    return boxes.find((node) => !node.closest("footer")) || null;
  }

  function composerBox() {
    const selectors = [
      'footer div[contenteditable="true"][role="textbox"]',
      '[data-testid="conversation-compose-box-input"]',
      'footer div[contenteditable="true"]',
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  function setEditableText(element, value) {
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete", false);
    if (value) document.execCommand("insertText", false, value);
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value,
    }));
  }

  function candidateRows() {
    const selectors = [
      '#pane-side [role="listitem"]',
      '#pane-side [role="row"]',
      '#pane-side [data-testid="cell-frame-container"]',
      '#pane-side div[tabindex="-1"]',
    ];
    for (const selector of selectors) {
      const rows = Array.from(document.querySelectorAll(selector));
      if (rows.length) return rows;
    }
    return Array.from(document.querySelectorAll("#pane-side > div div"));
  }

  function rowLabel(row) {
    const titled = Array.from(row.querySelectorAll("[title]"))
      .map((node) => String(node.getAttribute("title") || "").trim())
      .find(Boolean);
    if (titled) return titled;
    const aria = String(row.getAttribute("aria-label") || "").trim();
    if (aria) return aria;
    const text = String(row.textContent || "").replace(/\s+/g, " ").trim();
    return text.slice(0, 120);
  }

  function rowPhone(row) {
    const text = String(row.textContent || "");
    const match = text.match(/\+?\d[\d\s()-]{7,}\d/);
    return match ? match[0].replace(/\s+/g, " ").trim() : "";
  }

  function rowStableId(row) {
    const attributeNames = ["data-id", "data-chat-id", "data-jid"];
    for (const name of attributeNames) {
      const direct = String(row.getAttribute?.(name) || "").trim();
      if (direct) return direct;
      const nested = row.querySelector?.("[" + name + "]");
      const nestedValue = String(nested?.getAttribute?.(name) || "").trim();
      if (nestedValue) return nestedValue;
    }
    const href = String(row.querySelector?.("a[href]")?.getAttribute("href") || "").trim();
    if (href && /wa\.me|phone=|@c\.us|@g\.us/i.test(href)) return href;
    return "";
  }

  function digits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function buildChatResults(rows) {
    const labelCounts = new Map();
    for (const row of rows) {
      const label = rowLabel(row);
      if (!label) continue;
      const key = normalize(label);
      labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
    }

    const seen = new Set();
    const results = [];
    for (const row of rows) {
      const label = rowLabel(row);
      if (!label) continue;
      const labelKey = normalize(label);
      const stableId = rowStableId(row);
      const phone = rowPhone(row);
      const phoneDigits = digits(phone);
      const duplicateLabel = (labelCounts.get(labelKey) || 0) > 1;

      let chatKey = "";
      let safeToMap = true;
      let warning = "";
      if (stableId) chatKey = "wa-id:" + encodeURIComponent(stableId);
      else if (phoneDigits) chatKey = "wa-phone:" + phoneDigits;
      else if (!duplicateLabel) chatKey = "wa-label:" + encodeURIComponent(labelKey);
      else {
        safeToMap = false;
        warning = "Duplicate name found, but WhatsApp did not expose a stable ID or phone for this row. Open WhatsApp and make the contact uniquely identifiable before mapping or sending.";
      }

      const secondary = String(row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
      const signature = chatKey || ("unsafe|" + labelKey + "|" + secondary);
      if (seen.has(signature)) continue;
      seen.add(signature);
      results.push({ chatKey, chatLabel: label, phone, secondary, safeToMap, warning });
      if (results.length >= 60) break;
    }
    return results;
  }

  async function scanChats(query) {
    if (!whatsappReady()) throw new Error("WhatsApp Web is not ready.");
    const search = searchBox();
    if (!search) throw new Error("WhatsApp search box was not found.");
    setEditableText(search, String(query || "").trim());
    await sleep(1000);
    const results = buildChatResults(candidateRows()).filter((item) => {
      const needle = normalize(query);
      return !needle || normalize(item.chatLabel).includes(needle) || normalize(item.secondary).includes(needle);
    });
    setEditableText(search, "");
    await sleep(250);
    return { chats: results };
  }

  async function listChats() {
    if (!whatsappReady()) throw new Error("WhatsApp Web is not ready.");
    return { chats: buildChatResults(candidateRows()) };
  }

  function targetQuery(target) {
    return String(target.chatLabel || target.phone || "").trim();
  }

  async function openClient(target) {
    const query = targetQuery(target);
    const chatKey = String(target.chatKey || "");
    if (!query || !chatKey) throw new Error("WhatsApp chat does not have a safe stable mapping.");

    const search = searchBox();
    if (!search) throw new Error("WhatsApp search box was not found.");
    setEditableText(search, query);
    await sleep(900);

    const rows = candidateRows();
    let row = null;

    if (chatKey.startsWith("wa-id:")) {
      const wanted = decodeURIComponent(chatKey.slice("wa-id:".length));
      row = rows.find((item) => rowStableId(item) === wanted) || null;
    } else if (chatKey.startsWith("wa-phone:")) {
      const wanted = chatKey.slice("wa-phone:".length);
      row = rows.find((item) => digits(rowPhone(item)) === wanted) || null;
    } else if (chatKey.startsWith("wa-label:")) {
      const wanted = decodeURIComponent(chatKey.slice("wa-label:".length));
      const exact = rows.filter((item) => normalize(rowLabel(item)) === wanted);
      if (exact.length === 1) row = exact[0];
      else if (exact.length > 1) throw new Error("More than one WhatsApp chat now has this name. Re-scan and map a stable result.");
    }

    if (!row) {
      setEditableText(search, "");
      throw new Error("The exact mapped WhatsApp chat could not be found. Re-scan it before sending.");
    }

    row.click();
    await sleep(850);
    setEditableText(search, "");
    await sleep(250);
  }

  function simpleHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function allMessageContainers() {
    const direct = Array.from(document.querySelectorAll("#main div.message-in, #main div.message-out"));
    if (direct.length) return direct;
    return Array.from(document.querySelectorAll('#main [data-testid="msg-container"]'));
  }

  function messagePrePlain(node) {
    return String(
      node.getAttribute("data-pre-plain-text") ||
      node.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text") ||
      ""
    );
  }

  function localeMonthFirst() {
    try {
      const locale = document.documentElement.lang || navigator.language || "en-GB";
      const parts = new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric" })
        .formatToParts(new Date(2020, 10, 22))
        .filter((part) => part.type === "month" || part.type === "day");
      return parts[0]?.type === "month";
    } catch {
      return false;
    }
  }

  function parseSlashDate(first, second, yearValue) {
    let a = Number(first);
    let b = Number(second);
    let year = Number(yearValue);
    if (year < 100) year += 2000;
    let month;
    let day;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else if (localeMonthFirst()) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    return { year, month, day };
  }

  function parseWhatsAppTimestamp(prePlain) {
    const value = String(prePlain || "");
    let match = value.match(/\[(\d{1,2}):(\d{2}),\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]/);
    if (match) {
      const date = parseSlashDate(match[3], match[4], match[5]);
      return new Date(date.year, date.month - 1, date.day, Number(match[1]), Number(match[2])).toISOString();
    }
    match = value.match(/\[(\d{1,2}):(\d{2})\s*([AP]M),\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]/i);
    if (match) {
      let hour = Number(match[1]) % 12;
      if (match[3].toUpperCase() === "PM") hour += 12;
      const date = parseSlashDate(match[4], match[5], match[6]);
      return new Date(date.year, date.month - 1, date.day, hour, Number(match[2])).toISOString();
    }
    return null;
  }

  function extractMessage(node, target) {
    const textNode =
      node.querySelector('[data-testid="msg-text"]') ||
      node.querySelector(".selectable-text") ||
      node.querySelector('span[dir="ltr"]');
    const body = String(textNode?.textContent || "").trim();
    if (!body) return null;
    const prePlain = messagePrePlain(node);
    const remoteTimestamp = parseWhatsAppTimestamp(prePlain);
    const outbound = String(node.className || "").includes("message-out") || Boolean(node.closest(".message-out"));
    const rawId =
      node.getAttribute("data-id") ||
      node.querySelector("[data-id]")?.getAttribute("data-id") ||
      "";
    const remoteMessageKey = rawId
      ? "wa:" + rawId
      : "wa-history:" + simpleHash(String(target.chatKey || target.chatLabel || "") + "|" + prePlain + "|" + (outbound ? "out" : "in") + "|" + body);
    return {
      direction: outbound ? "outbound" : "inbound",
      body,
      remoteMessageKey,
      remoteTimestamp,
    };
  }

  function scrollContainer() {
    const direct = document.querySelector('[data-testid="conversation-panel-messages"]');
    if (direct) return direct;
    const candidates = Array.from(document.querySelectorAll("#main div")).filter((node) => {
      const style = window.getComputedStyle(node);
      return node.scrollHeight > node.clientHeight + 200 && ["auto", "scroll"].includes(style.overflowY);
    });
    return candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || null;
  }

  async function loadBackTo(dateFrom) {
    const targetTime = dateFrom ? new Date(dateFrom).getTime() : Date.now() - 24 * 60 * 60 * 1000;
    const scroller = scrollContainer();
    if (!scroller) return;
    let lastHeight = -1;
    let stuck = 0;

    for (let i = 0; i < 80; i += 1) {
      const timestamps = allMessageContainers()
        .map((node) => parseWhatsAppTimestamp(messagePrePlain(node)))
        .filter(Boolean)
        .map((value) => new Date(value).getTime())
        .filter(Number.isFinite);
      if (timestamps.length && Math.min(...timestamps) <= targetTime) break;

      const before = scroller.scrollHeight;
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(450);
      const after = scroller.scrollHeight;
      if (after === before || after === lastHeight) stuck += 1;
      else stuck = 0;
      lastHeight = after;
      if (stuck >= 4) break;
    }
  }

  async function fetchHistory(request) {
    await openClient(request);
    await loadBackTo(request.dateFrom);
    const from = request.dateFrom ? new Date(request.dateFrom).getTime() : Number.NEGATIVE_INFINITY;
    const to = request.dateTo ? new Date(request.dateTo).getTime() : Number.POSITIVE_INFINITY;
    const messages = allMessageContainers()
      .map((node) => extractMessage(node, request))
      .filter(Boolean)
      .filter((message) => {
        if (!message.remoteTimestamp) return false;
        const time = new Date(message.remoteTimestamp).getTime();
        return Number.isFinite(time) && time >= from && time < to;
      });
    return { messages };
  }

  async function sendToChat(target, body, remoteKeyPrefix) {
    if (busy) {
      for (let i = 0; i < 20 && busy; i += 1) await sleep(250);
    }
    busy = true;
    try {
      await openClient(target);
      const composer = composerBox();
      if (!composer) throw new Error("WhatsApp message composer was not found.");
      setEditableText(composer, String(body || ""));
      await sleep(200);
      const sendButton =
        document.querySelector('[data-testid="compose-btn-send"]') ||
        document.querySelector('button[aria-label*="Send"]') ||
        document.querySelector('[data-icon="send"]')?.closest("button,div[role='button']");
      if (sendButton) {
        sendButton.click();
      } else {
        composer.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true,
        }));
      }
      await sleep(650);
      return { ok: true, remoteMessageKey: (remoteKeyPrefix || "outbound:") + Date.now() };
    } finally {
      busy = false;
    }
  }

  function extractRecentInbound(target) {
    return allMessageContainers().slice(-60).map((node) => {
      const message = extractMessage(node, target);
      if (!message || message.direction !== "inbound") return null;
      return {
        clientId: target.clientId,
        body: message.body,
        remoteMessageKey: message.remoteMessageKey,
        receivedAt: message.remoteTimestamp || new Date().toISOString(),
      };
    }).filter(Boolean);
  }

  async function syncOneClient() {
    if (busy || !whatsappReady() || !clients.length) return;
    if (Date.now() - lastSyncAt < 10000) return;
    busy = true;
    try {
      const target = clients[cycleIndex % clients.length];
      cycleIndex = (cycleIndex + 1) % clients.length;
      await openClient(target);
      const messages = extractRecentInbound(target);
      if (messages.length) {
        await chrome.runtime.sendMessage({ type: "WA_INBOUND_BATCH", messages });
      }
      lastSyncAt = Date.now();
    } catch {
      lastSyncAt = Date.now();
    } finally {
      busy = false;
    }
  }

  async function processBridgeRequest(request) {
    if (!request || !request.requestType) throw new Error("Invalid bridge request.");
    if (request.requestType === "scan") return scanChats(request.query);
    if (request.requestType === "list_chats") return listChats();
    if (request.requestType === "history") return fetchHistory(request);
    if (request.requestType === "direct_send") {
      const result = await sendToChat(request, request.payload?.body || "", "direct:");
      return { sent: result.ok === true, remoteMessageKey: result.remoteMessageKey || "" };
    }
    throw new Error("Unsupported bridge request.");
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    if (message.type === "WA_CONFIG") {
      clients = Array.isArray(message.clients) ? message.clients : [];
      sendResponse({ ok: true, clientCount: clients.length });
      return false;
    }

    if (message.type === "WA_SEND_MESSAGE") {
      sendToChat(message.message, message.message?.body || "", "outbound:")
        .then((result) => sendResponse({ ok: true, remoteMessageKey: result.remoteMessageKey || ("outbound:" + message.message?.id) }))
        .catch((error) => sendResponse({ ok: false, error: error?.message || "Send failed." }));
      return true;
    }

    if (message.type === "WA_BRIDGE_REQUEST") {
      processBridgeRequest(message.request)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error?.message || "WhatsApp request failed." }));
      return true;
    }

    return false;
  });

  async function tick() {
    const ready = whatsappReady();
    try {
      await chrome.runtime.sendMessage({ type: "BRIDGE_TICK", whatsappReady: ready });
    } catch {
      // Extension may be reloading.
    }
    if (ready) void syncOneClient();
  }

  window.setInterval(tick, 5000);
  window.setTimeout(tick, 1000);
})();
