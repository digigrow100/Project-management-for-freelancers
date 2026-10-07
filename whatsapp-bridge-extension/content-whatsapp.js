(() => {
  let clients = [];
  let cycleIndex = 0;
  let busy = false;
  let lastSyncAt = 0;
  let lastOpenedChatKey = "";
  let activeTarget = null;

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
      'input[placeholder*="Search" i]',
      'input[aria-label*="Search" i]',
      '[data-testid="chat-list-search"] input',
      '[data-testid="chat-list-search"] div[contenteditable="true"]',
      'div[contenteditable="true"][data-tab="3"]',
      'div[contenteditable="true"][role="textbox"][aria-placeholder*="Search" i]',
      'div[contenteditable="true"][role="textbox"][aria-label*="Search" i]',
      'div[contenteditable="true"][role="textbox"][title*="Search" i]',
      '[role="textbox"][aria-label*="Search or start new chat" i]',
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node && !node.closest("footer")) return node;
    }

    const genericInputs = Array.from(document.querySelectorAll('input, [contenteditable="true"][role="textbox"]'));
    return genericInputs.find((node) => {
      if (node.closest("footer")) return false;
      const hint = [
        node.getAttribute?.("placeholder"),
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.getAttribute?.("aria-placeholder"),
      ].filter(Boolean).join(" ");
      return /search/i.test(hint);
    }) || null;
  }

  function composerBox() {
    const selectors = [
      '#main footer div[contenteditable="true"][role="textbox"]',
      '#main [data-testid="conversation-compose-box-input"]',
      '#main div[contenteditable="true"][role="textbox"][aria-label*="message" i]',
      '#main div[contenteditable="true"][role="textbox"][data-tab]',
      '#main footer div[contenteditable="true"]',
      '#main div[contenteditable="true"][role="textbox"]',
      'footer div[contenteditable="true"]',
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node && node.offsetParent) return node;
    }
    return null;
  }

  function setEditableText(element, value) {
    element.focus();

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(
        element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

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

  function canonicalRow(node) {
    if (!(node instanceof HTMLElement)) return null;
    return (
      node.closest('[data-testid="cell-frame-container"]') ||
      node.closest('[role="listitem"]') ||
      node.closest('[role="row"]') ||
      node.closest('div[tabindex="-1"]') ||
      node
    );
  }

  function candidateRows() {
    const selectorGroups = [
      '#pane-side [data-testid="cell-frame-container"]',
      '[data-testid="search-results-list"] [data-testid="cell-frame-container"]',
      '#pane-side [role="listitem"]',
      '[data-testid="search-results-list"] [role="listitem"]',
      '#pane-side [role="row"]',
      '[aria-label*="Search results" i] [role="row"]',
      '#pane-side div[tabindex="-1"]',
    ];

    for (const selector of selectorGroups) {
      const seen = new Set();
      const rows = [];
      for (const node of document.querySelectorAll(selector)) {
        const row = canonicalRow(node);
        if (!(row instanceof HTMLElement) || !row.offsetParent || seen.has(row)) continue;
        seen.add(row);
        rows.push(row);
      }
      if (rows.length) return rows;
    }

    const seen = new Set();
    const fallback = [];
    for (const titleNode of document.querySelectorAll('#pane-side [title], [aria-label*="Search results" i] [title]')) {
      const row = canonicalRow(titleNode);
      if (!(row instanceof HTMLElement) || !row.offsetParent || seen.has(row)) continue;
      seen.add(row);
      fallback.push(row);
    }
    return fallback;
  }

  function looksLikeIconLabel(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return true;
    return (
      normalized.startsWith("wds-") ||
      normalized.startsWith("ic-") ||
      normalized.includes("chatlock-outline") ||
      normalized === "locked chats" ||
      normalized === "archived" ||
      normalized === "mute" ||
      normalized === "pin"
    );
  }

  function looksLikeMessagePreview(value) {
    const text = String(value || "").trim();
    const normalized = text.toLowerCase();
    if (!text) return true;
    if (/^https?:\/\//i.test(text)) return true;
    if (/^www\./i.test(text)) return true;
    if (/^\+?\d[\d\s()-]{7,}\d$/.test(text)) return true;
    if (/^\d{1,2}:\d{2}(?:\s*[ap]m)?$/i.test(text)) return true;
    if (/^(yesterday|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(text)) return true;
    if (/unread|message|delivered|read|typing|online/.test(normalized)) return true;
    return false;
  }

  function rowLabel(row) {
    const titleCandidates = Array.from(row.querySelectorAll("span[title], div[title]"))
      .map((node) => String(node.getAttribute("title") || "").trim())
      .filter((value) =>
        value &&
        value.length <= 120 &&
        !looksLikeIconLabel(value) &&
        !looksLikeMessagePreview(value)
      );

    if (titleCandidates.length) {
      return titleCandidates[0];
    }

    const ariaCandidates = [
      String(row.getAttribute("aria-label") || "").trim(),
      ...Array.from(row.querySelectorAll("[aria-label]"))
        .map((node) => String(node.getAttribute("aria-label") || "").trim()),
    ].filter((value) =>
      value &&
      value.length <= 120 &&
      !looksLikeIconLabel(value) &&
      !looksLikeMessagePreview(value)
    );
    if (ariaCandidates.length) return ariaCandidates[0];

    const text = String(row.textContent || "").replace(/\s+/g, " ").trim();
    const cleaned = text
      .replace(/^\d+\s+unread\s+messages?/i, "")
      .replace(/^\d+\s+unread\s+message/i, "")
      .replace(/^wds-[^\s]+/i, "")
      .replace(/^ic-[^\s]+/i, "")
      .trim();

    const firstChunk = cleaned.split(/\d{1,2}:\d{2}(?:\s*[AP]M)?/i)[0]?.trim() || cleaned;
    return firstChunk.slice(0, 120);
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

  function isSystemChatRow(label) {
    const value = normalize(label);
    return (
      !value ||
      value === "locked chats" ||
      value.startsWith("locked chats ") ||
      value === "archived" ||
      value.startsWith("archived ") ||
      value === "communities" ||
      value === "status" ||
      value === "channels"
    );
  }

  function buildChatResults(rows) {
    const labelCounts = new Map();
    for (const row of rows) {
      const label = rowLabel(row);
      if (!label || isSystemChatRow(label)) continue;
      const key = normalize(label);
      labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
    }

    const seen = new Set();
    const results = [];
    for (const row of rows) {
      const label = rowLabel(row);
      if (!label || isSystemChatRow(label)) continue;
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

      const rawSecondary = String(row.textContent || "").replace(/\s+/g, " ").trim();
      const secondary = [
        phone,
        rawSecondary.match(/\b\d+\s+unread\s+messages?\b/i)?.[0] || "",
      ].filter(Boolean).join(" · ").slice(0, 120);
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

    const needle = normalize(query);
    setEditableText(search, String(query || "").trim());

    let rows = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await sleep(attempt === 0 ? 700 : 350);
      rows = candidateRows();
      const hasNeedle = rows.some((row) => normalize(rowLabel(row)).includes(needle) || normalize(row.textContent).includes(needle));
      if (rows.length && hasNeedle) break;
    }

    const results = buildChatResults(rows).filter((item) =>
      !needle || normalize(item.chatLabel).includes(needle) || normalize(item.secondary).includes(needle)
    );

    setEditableText(search, "");
    await sleep(250);
    return { chats: results, debug: { rowCount: rows.length } };
  }

  async function listChats() {
    if (!whatsappReady()) throw new Error("WhatsApp Web is not ready.");
    return { chats: buildChatResults(candidateRows()) };
  }

  function targetQuery(target) {
    return String(target.chatLabel || target.phone || "").trim();
  }

  function currentChatLabel() {
    const header = document.querySelector("#main header");
    if (!header) return "";
    const candidates = Array.from(header.querySelectorAll("span[title], div[title], [aria-label]"))
      .map((node) => String(node.getAttribute("title") || node.getAttribute("aria-label") || "").trim())
      .filter((value) => value && !looksLikeIconLabel(value) && !looksLikeMessagePreview(value));
    return candidates[0] || "";
  }

  function clickChatRow(row, target) {
    const wanted = normalize(target.chatLabel || "");
    const titleNode = Array.from(row.querySelectorAll("span[title], div[title]"))
      .find((node) => normalize(node.getAttribute("title")) === wanted);

    const candidates = [
      titleNode,
      titleNode?.closest('[role="button"]'),
      titleNode?.closest('[tabindex]'),
      row.querySelector('[role="button"]'),
      row.querySelector('[tabindex="0"]'),
      row,
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue;
      try {
        candidate.scrollIntoView({ block: "center", inline: "nearest" });
      } catch {}
      const rect = candidate.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + Math.min(12, Math.max(1, rect.width / 2)),
        clientY: rect.top + Math.min(12, Math.max(1, rect.height / 2)),
        button: 0,
      };
      candidate.dispatchEvent(new PointerEvent("pointerdown", init));
      candidate.dispatchEvent(new MouseEvent("mousedown", init));
      candidate.dispatchEvent(new PointerEvent("pointerup", init));
      candidate.dispatchEvent(new MouseEvent("mouseup", init));
      candidate.click();
    }
  }

  function activeChatMatches(target) {
    const expected = normalize(target.chatLabel || target.phone || "");
    if (!expected) return false;
    const active = normalize(currentChatLabel());
    if (!active) return false;
    return active === expected || active.includes(expected) || expected.includes(active);
  }

  async function waitForOpenedChat(target, timeoutMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const composer = composerBox();
      if (composer) {
        const matches = activeChatMatches(target);
        const search = searchBox();
        // Current WhatsApp builds can hide/remove the search input immediately
        // after the selected row opens. In that state, the visible composer is
        // the strongest signal that the click successfully opened a conversation.
        if (matches || !search) {
          lastOpenedChatKey = String(target.chatKey || "");
          activeTarget = { ...target };
          return true;
        }
      }
      await sleep(150);
    }
    return false;
  }

  async function openClient(target) {
    const query = targetQuery(target);
    const chatKey = String(target.chatKey || "");
    if (!query || !chatKey) throw new Error("WhatsApp chat does not have a safe stable mapping.");

    const existingComposer = composerBox();
    if (existingComposer && (lastOpenedChatKey === chatKey || activeChatMatches(target))) {
      lastOpenedChatKey = chatKey;
      activeTarget = { ...target };
      return true;
    }

    const search = searchBox();
    if (!search) {
      // If the app just opened this chat, WhatsApp may remove the search box
      // from the DOM while leaving the conversation composer active.
      if (existingComposer && lastOpenedChatKey === chatKey) return true;
      throw new Error("WhatsApp search box was not found.");
    }
    setEditableText(search, query);

    let rows = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await sleep(attempt === 0 ? 650 : 250);
      rows = candidateRows();
      if (rows.length) break;
    }

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
      else if (exact.length > 1) throw new Error("More than one WhatsApp chat now has this name. Re-scan and add the exact result again.");
    }

    if (!row && target.chatLabel) {
      const exactLabel = rows.filter((item) => normalize(rowLabel(item)) === normalize(target.chatLabel));
      if (exactLabel.length === 1) row = exactLabel[0];
    }

    if (!row) {
      throw new Error("The exact WhatsApp chat could not be found. Re-scan and add the chat again.");
    }

    clickChatRow(row, target);

    const opened = await waitForOpenedChat(target, 7000);
    if (!opened) {
      throw new Error("WhatsApp found the contact but did not open the conversation.");
    }

    // Keep the search state untouched after opening. Clearing it immediately
    // can make current WhatsApp Web builds jump back to the normal chat list.
    activeTarget = { ...target };
    return true;
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
    const classText = [
      String(node.className || ""),
      ...Array.from(node.parentElement ? [node.parentElement, node.parentElement.parentElement].filter(Boolean) : [])
        .map((item) => String(item.className || "")),
    ].join(" ");
    let outbound =
      /message-out|outgoing|from-me|sent/i.test(classText) ||
      Boolean(node.closest(".message-out, [data-testid*='outgoing'], [data-testid*='sent']"));

    if (!outbound) {
      const pre = prePlain.toLowerCase();
      if (/\]\s*(you|me)\s*:/i.test(prePlain) || /\byou\s*:/.test(pre)) outbound = true;
    }

    if (!outbound) {
      const panel = document.querySelector("#main");
      if (panel) {
        const panelRect = panel.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        if (nodeRect.width > 0 && panelRect.width > 0) {
          outbound = nodeRect.left + nodeRect.width / 2 > panelRect.left + panelRect.width * 0.58;
        }
      }
    }

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
    if (busy) {
      for (let i = 0; i < 40 && busy; i += 1) await sleep(250);
    }
    if (busy) throw new Error("WhatsApp bridge is busy. Try the history request again.");
    busy = true;
    try {
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
    } finally {
      busy = false;
    }
  }

  async function sendToChat(target, body, remoteKeyPrefix) {
    if (busy) {
      for (let i = 0; i < 20 && busy; i += 1) await sleep(250);
    }
    busy = true;
    try {
      await openClient(target);
      let composer = composerBox();
      for (let attempt = 0; attempt < 20 && !composer; attempt += 1) {
        await sleep(150);
        composer = composerBox();
      }
      if (!composer) throw new Error("WhatsApp conversation opened but the message box was not found.");

      const text = String(body || "");
      setEditableText(composer, text);
      await sleep(300);

      const verifiedText = String(composer.textContent || "").replace(/\u00a0/g, " ").trim();
      if (!verifiedText && text) {
        throw new Error("WhatsApp chat is open, but the message box did not accept the text.");
      }

      const sendButton =
        document.querySelector('#main [data-testid="compose-btn-send"]') ||
        document.querySelector('#main button[aria-label*="Send" i]') ||
        document.querySelector('#main [data-icon="send"]')?.closest("button,div[role='button']") ||
        document.querySelector('#main button span[data-icon="send"]')?.closest("button");

      if (sendButton instanceof HTMLElement) {
        sendButton.click();
      } else {
        composer.focus();
        composer.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }));
        composer.dispatchEvent(new KeyboardEvent("keyup", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }));
      }

      await sleep(800);
      lastOpenedChatKey = String(target.chatKey || "");
      return { ok: true, remoteMessageKey: (remoteKeyPrefix || "outbound:") + Date.now() };
    } finally {
      busy = false;
    }
  }

  function extractRecentInbound(target) {
    const syncFrom = target.syncFrom ? new Date(target.syncFrom).getTime() : Date.now();
    return allMessageContainers().slice(-60).map((node) => {
      const message = extractMessage(node, target);
      if (!message || message.direction !== "inbound" || !message.remoteTimestamp) return null;
      const receivedTime = new Date(message.remoteTimestamp).getTime();
      if (!Number.isFinite(receivedTime) || receivedTime < syncFrom) return null;
      return {
        clientId: target.clientId,
        body: message.body,
        remoteMessageKey: message.remoteMessageKey,
        receivedAt: message.remoteTimestamp,
      };
    }).filter(Boolean);
  }

  async function syncOneClient() {
    if (busy || !whatsappReady() || !clients.length) return;
    if (Date.now() - lastSyncAt < 3000) return;
    busy = true;
    try {
      let target = null;

      if (activeTarget?.clientId) {
        target = clients.find((item) => String(item.clientId) === String(activeTarget.clientId)) || null;
      }

      if (!target) {
        target = clients[cycleIndex % clients.length];
        cycleIndex = (cycleIndex + 1) % clients.length;
        await openClient(target);
      }

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

  async function peekChat(request) {
    await openClient(request);
    const messages = allMessageContainers()
      .slice(-120)
      .map((node) => extractMessage(node, request))
      .filter(Boolean);
    return { messages };
  }

  async function processBridgeRequest(request) {
    if (!request || !request.requestType) throw new Error("Invalid bridge request.");
    if (request.requestType === "scan") return scanChats(request.query);
    if (request.requestType === "list_chats") return listChats();
    if (request.requestType === "history") return fetchHistory(request);
    if (request.requestType === "peek_chat") return peekChat(request);
    if (request.requestType === "open_chat") {
      await openClient(request);
      return { opened: true };
    }
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

  window.setInterval(tick, 3000);
  window.setTimeout(tick, 1000);
})();
