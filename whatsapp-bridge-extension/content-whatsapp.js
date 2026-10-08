(() => {
  let clients = [];
  let cycleIndex = 0;
  let busy = false;
  let lastSyncAt = 0;
  let lastOpenedChatKey = "";
  let activeTarget = null;
  let audioQueueRunning = false;
  const audioTransferState = new Map();

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function whatsappReady() {
    // WhatsApp removes/replaces #pane-side while search is active in current
    // builds. Treat a visible chat search box or message composer as a logged-in
    // session too; otherwise the bridge incorrectly reports "QR/login required".
    const search = searchBox();
    const composer = composerBox();
    return Boolean(
      (search instanceof HTMLElement && search.offsetParent) ||
      (composer instanceof HTMLElement && composer.offsetParent) ||
      document.querySelector("#pane-side") ||
      document.querySelector('[data-testid="chat-list"]') ||
      document.querySelector('[aria-label*="Chat list" i]') ||
      document.querySelector('[aria-label*="Chats" i]')
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
      if (node instanceof HTMLElement && node.offsetParent && !node.closest("footer")) return node;
    }

    const genericInputs = Array.from(document.querySelectorAll(
      'input, textarea, [contenteditable="true"], [role="textbox"]'
    ));

    const hinted = genericInputs.find((node) => {
      if (!(node instanceof HTMLElement) || !node.offsetParent || node.closest("footer")) return false;
      const hint = [
        node.getAttribute?.("placeholder"),
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.getAttribute?.("aria-placeholder"),
      ].filter(Boolean).join(" ");
      return /search/i.test(hint);
    });
    if (hinted) return hinted;

    return genericInputs.find((node) => {
      if (!(node instanceof HTMLElement) || !node.offsetParent || node.closest("footer")) return false;
      if (node.closest("#main")) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 180 &&
        rect.height >= 28 &&
        rect.height <= 80 &&
        rect.top >= 20 &&
        rect.top <= 180 &&
        rect.left >= 0 &&
        rect.left < window.innerWidth * 0.6;
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

    // execCommand("insertText") already fires the input event that WhatsApp's
    // editor listens for. Dispatching a second synthetic InputEvent caused the
    // same text to be inserted twice in current WhatsApp Web builds.
    if (value) document.execCommand("insertText", false, value);
  }

  function canonicalRow(node) {
    if (!(node instanceof HTMLElement)) return null;

    const semantic =
      node.closest('[data-testid="cell-frame-container"]') ||
      node.closest('[role="option"]') ||
      node.closest('[role="listitem"]') ||
      node.closest('[role="row"]') ||
      node.closest('div[tabindex="-1"]');

    if (semantic instanceof HTMLElement) return semantic;

    // WhatsApp frequently changes the search result markup and sometimes removes
    // semantic roles entirely. Walk upward and pick the first visible row-sized
    // container instead of depending only on data-testid/role selectors.
    let current = node;
    for (let depth = 0; depth < 7 && current; depth += 1) {
      const rect = current.getBoundingClientRect();
      const text = String(current.textContent || "").replace(/\s+/g, " ").trim();
      if (
        current.offsetParent &&
        rect.width >= 180 &&
        rect.height >= 42 &&
        rect.height <= 130 &&
        text.length >= 2
      ) {
        return current;
      }
      current = current.parentElement;
    }

    return node;
  }

  function visibleSearchResultRows(query) {
    const needle = normalize(query);
    const search = searchBox();
    const nodes = Array.from(document.querySelectorAll(
      'span[title], div[title], [aria-label], span[dir="auto"], span[dir="ltr"], div[dir="auto"], div[dir="ltr"]'
    ));
    const seen = new Set();
    const rows = [];

    for (const node of nodes) {
      if (!(node instanceof HTMLElement) || !node.offsetParent) continue;
      if (search && (node === search || node.contains(search) || search.contains(node))) continue;
      if (node.closest("#main")) continue;

      const raw = String(
        node.getAttribute("title") ||
        node.getAttribute("aria-label") ||
        node.textContent ||
        ""
      ).replace(/\s+/g, " ").trim();

      if (!raw || raw.length > 180 || looksLikeIconLabel(raw) || looksLikeMessagePreview(raw)) continue;
      const normalized = normalize(raw);
      if (needle && !normalized.includes(needle)) continue;

      const row = canonicalRow(node);
      if (!(row instanceof HTMLElement) || !row.offsetParent || seen.has(row)) continue;

      const rect = row.getBoundingClientRect();
      if (rect.width < 160 || rect.height < 35 || rect.height > 150) continue;

      seen.add(row);
      rows.push(row);
    }

    return rows;
  }

  function candidateRows() {
    const selectorGroups = [
      '[data-testid="search-results-list"] [data-testid="cell-frame-container"]',
      '[aria-label*="Search results" i] [data-testid="cell-frame-container"]',
      '[role="listbox"] [role="option"]',
      '[role="listbox"] [role="listitem"]',
      '[aria-label*="Search results" i] [role="listitem"]',
      '[aria-label*="Search results" i] [role="row"]',
      '[role="grid"] [role="row"]',
      '#pane-side [data-testid="cell-frame-container"]',
      '#pane-side [role="listitem"]',
      '#pane-side [role="row"]',
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
    const roots = [
      document.querySelector('[data-testid="search-results-list"]'),
      document.querySelector('[aria-label*="Search results" i]'),
      document.querySelector('#pane-side'),
    ].filter(Boolean);

    for (const root of roots) {
      const nodes = root.querySelectorAll(
        '[title], [aria-label], span[dir="auto"], span[dir="ltr"], div[dir="auto"], div[dir="ltr"]'
      );
      for (const node of nodes) {
        if (!(node instanceof HTMLElement) || !node.offsetParent) continue;
        const text = String(
          node.getAttribute("title") ||
          node.getAttribute("aria-label") ||
          node.textContent ||
          ""
        ).replace(/\s+/g, " ").trim();
        if (!text || text.length > 160 || looksLikeIconLabel(text) || looksLikeMessagePreview(text)) continue;
        const row = canonicalRow(node);
        if (!(row instanceof HTMLElement) || !row.offsetParent || seen.has(row)) continue;
        seen.add(row);
        fallback.push(row);
      }
      if (fallback.length) break;
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
    setEditableText(search, "");
    await sleep(80);
    setEditableText(search, String(query || "").trim());

    let rows = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(attempt === 0 ? 800 : 300);
      rows = candidateRows();

      // Current WhatsApp Web search can render contacts outside #pane-side and
      // without stable list roles/testids. Fall back to visible result text.
      if (!rows.length || !rows.some((row) => normalize(row.textContent).includes(needle))) {
        const visibleRows = visibleSearchResultRows(query);
        if (visibleRows.length) rows = visibleRows;
      }

      if (rows.length) break;
    }

    const results = buildChatResults(rows);

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

  async function clickChatRow(row, target) {
    const wanted = normalize(target.chatLabel || "");
    const titleNode = Array.from(row.querySelectorAll("span[title], div[title], [aria-label]"))
      .find((node) => {
        const label = node.getAttribute("title") || node.getAttribute("aria-label") || "";
        return normalize(label) === wanted;
      });

    const clickable = [
      titleNode?.closest('[data-testid="cell-frame-container"]'),
      titleNode?.closest('[role="option"]'),
      titleNode?.closest('[role="listitem"]'),
      titleNode?.closest('[role="row"]'),
      titleNode?.closest('[role="button"]'),
      titleNode?.closest('[tabindex]'),
      row.querySelector('[role="button"]'),
      row.querySelector('[tabindex="0"]'),
      row.querySelector('[tabindex="-1"]'),
      row,
    ].find((node) => node instanceof HTMLElement && node.offsetParent);

    if (!(clickable instanceof HTMLElement)) return false;

    try {
      clickable.scrollIntoView({ block: "center", inline: "nearest" });
    } catch {}

    try {
      clickable.focus({ preventScroll: true });
    } catch {}

    const rect = clickable.getBoundingClientRect();
    const x = rect.left + Math.max(4, Math.min(rect.width / 2, 40));
    const y = rect.top + Math.max(4, Math.min(rect.height / 2, 24));
    const pointer = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };

    clickable.dispatchEvent(new PointerEvent("pointerdown", pointer));
    clickable.dispatchEvent(new MouseEvent("mousedown", pointer));
    clickable.dispatchEvent(new PointerEvent("pointerup", pointer));
    clickable.dispatchEvent(new MouseEvent("mouseup", pointer));
    clickable.dispatchEvent(new MouseEvent("click", pointer));
    clickable.click();

    await sleep(350);
    if (composerBox() || activeChatMatches(target)) return true;

    // Some current WhatsApp Web builds require keyboard activation of a
    // focused search result rather than a synthetic mouse click.
    clickable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    clickable.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    await sleep(350);
    return Boolean(composerBox() || activeChatMatches(target));
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

    await clickChatRow(row, target);

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

  function isVoiceNoteNode(node) {
    return Boolean(
      node.querySelector("audio") ||
      node.querySelector('[data-icon="ptt-status"]') ||
      node.querySelector('[data-icon*="audio" i]') ||
      node.querySelector('[data-icon*="voice" i]') ||
      node.querySelector('[aria-label*="voice message" i]') ||
      node.querySelector('[aria-label*="play voice message" i]')
    );
  }

  function extractMessage(node, target) {
    if (isVoiceNoteNode(node)) return null;

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

  function isOutboundMessageNode(node) {
    const classText = [
      String(node.className || ""),
      ...Array.from(node.parentElement ? [node.parentElement, node.parentElement.parentElement].filter(Boolean) : [])
        .map((item) => String(item.className || "")),
    ].join(" ");
    let outbound =
      /message-out|outgoing|from-me|sent/i.test(classText) ||
      Boolean(node.closest(".message-out, [data-testid*='outgoing'], [data-testid*='sent']"));

    const prePlain = messagePrePlain(node);
    if (!outbound && (/\]\s*(you|me)\s*:/i.test(prePlain) || /\byou\s*:/.test(prePlain.toLowerCase()))) {
      outbound = true;
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
    return outbound;
  }

  const AUDIO_PAGE_CHANNEL = "__fhq_wa_audio__";
  let audioBridgeSeq = 0;
  const audioBridgePending = new Map();

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (
      event.source !== window ||
      !data ||
      data.channel !== AUDIO_PAGE_CHANNEL ||
      data.direction !== "response"
    ) {
      return;
    }
    const resolve = audioBridgePending.get(data.id);
    if (resolve) {
      audioBridgePending.delete(data.id);
      resolve(data);
    }
  });

  function askAudioPage(action, timeout = 5000) {
    return new Promise((resolve) => {
      const id = ++audioBridgeSeq;
      audioBridgePending.set(id, resolve);
      window.postMessage({
        channel: AUDIO_PAGE_CHANNEL,
        direction: "request",
        id,
        action,
      }, "*");
      window.setTimeout(() => {
        if (!audioBridgePending.has(id)) return;
        audioBridgePending.delete(id);
        resolve({ ok: false, error: "Voice-note capture timed out." });
      }, timeout);
    });
  }

  function pressElement(element) {
    if (!(element instanceof HTMLElement)) return;
    const opts = { bubbles: true, cancelable: true, composed: true };
    try {
      element.dispatchEvent(new PointerEvent("pointerdown", opts));
      element.dispatchEvent(new MouseEvent("mousedown", opts));
      element.dispatchEvent(new PointerEvent("pointerup", opts));
      element.dispatchEvent(new MouseEvent("mouseup", opts));
    } catch {}
    try {
      element.click();
    } catch {}
  }

  function controlIconText(element) {
    if (!(element instanceof HTMLElement)) return "";
    const iconNames = Array.from(element.querySelectorAll("[data-icon]"))
      .map((node) => String(node.getAttribute("data-icon") || ""))
      .join(" ");
    return normalize([
      iconNames,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent,
    ].filter(Boolean).join(" "));
  }

  function findVoiceTransportButton(node) {
    const buttons = Array.from(node.querySelectorAll("button"))
      .filter((button) => button instanceof HTMLElement && button.offsetParent);
    if (!buttons.length) return null;

    const slider = node.querySelector('[role="slider"]');
    if (slider) {
      const before = buttons.filter(
        (button) => button.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      if (before.length) return before[before.length - 1];
    }

    return buttons.find((button) => {
      const label = controlIconText(button);
      return !/\b\d+(?:[.,]\d+)?\s*[x×]\b/i.test(label);
    }) || null;
  }

  function isDownloadVoiceControl(element) {
    return /download/.test(controlIconText(element));
  }

  async function waitForVoiceTransport(node, timeoutMs = 25000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const button = findVoiceTransportButton(node);
      if (button && !isDownloadVoiceControl(button)) return button;
      await sleep(200);
    }
    return null;
  }

  async function captureVoiceBlob(node) {
    const pageReady = await askAudioPage("ping", 2000);
    if (!pageReady?.ok) {
      throw new Error("WhatsApp audio capture hook is not active. Reload WhatsApp Web.");
    }

    let transport = findVoiceTransportButton(node);
    if (!transport) throw new Error("Voice-note control was not found.");

    if (isDownloadVoiceControl(transport)) {
      pressElement(transport);
      transport = await waitForVoiceTransport(node);
      if (!transport) throw new Error("WhatsApp did not finish downloading this voice note.");
    }

    const id = ++audioBridgeSeq;
    const capturedPromise = new Promise((resolve) => {
      audioBridgePending.set(id, resolve);
      window.postMessage({
        channel: AUDIO_PAGE_CHANNEL,
        direction: "request",
        id,
        action: "arm",
      }, "*");
      window.setTimeout(() => {
        if (!audioBridgePending.has(id)) return;
        audioBridgePending.delete(id);
        resolve({ ok: false, error: "Voice-note capture timed out." });
      }, 30000);
    });

    await sleep(60);
    pressElement(transport);
    const captured = await capturedPromise;
    void askAudioPage("disarm", 1500);

    if (!captured?.ok || !(captured.blob instanceof Blob) || !captured.blob.size) {
      throw new Error(captured?.error || "Could not capture WhatsApp voice note.");
    }
    return captured.blob;
  }

  function extractAudioDescriptor(node, target) {
    if (isOutboundMessageNode(node) || !isVoiceNoteNode(node)) return null;

    const prePlain = messagePrePlain(node);
    const remoteTimestamp = parseWhatsAppTimestamp(prePlain);
    if (!remoteTimestamp) return null;

    const rawId =
      node.getAttribute("data-id") ||
      node.querySelector("[data-id]")?.getAttribute("data-id") ||
      "";
    const remoteMessageKey = rawId
      ? "wa:" + rawId
      : "wa-audio:" + simpleHash(
          String(target.chatKey || target.chatLabel || "") + "|" + prePlain
        );

    return {
      clientId: target.clientId,
      remoteMessageKey,
      receivedAt: remoteTimestamp,
      node,
    };
  }

  function extractRecentAudio(target) {
    const syncFrom = target.syncFrom ? new Date(target.syncFrom).getTime() : Date.now();
    return allMessageContainers()
      .slice(-60)
      .map((node) => extractAudioDescriptor(node, target))
      .filter(Boolean)
      .filter((item) => {
        const time = new Date(item.receivedAt).getTime();
        return Number.isFinite(time) && time >= syncFrom;
      });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read WhatsApp voice note."));
      reader.onload = () => {
        const value = String(reader.result || "");
        const comma = value.indexOf(",");
        resolve(comma >= 0 ? value.slice(comma + 1) : value);
      };
      reader.readAsDataURL(blob);
    });
  }

  async function uploadAudioDescriptor(item) {
    const blob = await captureVoiceBlob(item.node);
    if (!blob.size) throw new Error("WhatsApp voice note is empty.");
    if (blob.size > 2500000) {
      throw new Error("WhatsApp voice note is too large to process safely.");
    }

    const dataBase64 = await blobToBase64(blob);
    const result = await chrome.runtime.sendMessage({
      type: "WA_AUDIO_INBOUND",
      audio: {
        clientId: item.clientId,
        remoteMessageKey: item.remoteMessageKey,
        receivedAt: item.receivedAt,
        mimeType: blob.type || "audio/ogg",
        dataBase64,
      },
    });
    if (!result?.ok) throw new Error(result?.error || "Voice note processing failed.");
  }

  async function processAudioCandidates(items) {
    if (audioQueueRunning || !Array.isArray(items) || !items.length) return;
    audioQueueRunning = true;
    try {
      for (const item of items.slice(-4)) {
        const key = String(item.remoteMessageKey || "");
        if (!key) continue;

        const previous = audioTransferState.get(key);
        if (previous?.status === "done" || previous?.status === "uploading") continue;
        if (
          previous?.status === "failed" &&
          Date.now() - Number(previous.lastAttempt || 0) < 120000
        ) {
          continue;
        }
        if (Number(previous?.attempts || 0) >= 3) continue;

        const attempts = Number(previous?.attempts || 0) + 1;
        audioTransferState.set(key, {
          status: "uploading",
          attempts,
          lastAttempt: Date.now(),
        });

        try {
          await uploadAudioDescriptor(item);
          audioTransferState.set(key, {
            status: "done",
            attempts,
            lastAttempt: Date.now(),
          });
        } catch (error) {
          console.warn("WhatsApp voice-note processing failed:", error);
          audioTransferState.set(key, {
            status: "failed",
            attempts,
            lastAttempt: Date.now(),
          });
        }
      }
    } finally {
      audioQueueRunning = false;
    }
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

      let verifiedText = String(composer.textContent || "").replace(/\u00a0/g, " ").trim();
      if (verifiedText !== text.trim() && text) {
        // Never send a duplicated or mutated payload. Clear the composer and
        // make one clean insertion attempt.
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("delete", false);
        document.execCommand("insertText", false, text);
        await sleep(250);
        verifiedText = String(composer.textContent || "").replace(/\u00a0/g, " ").trim();
      }

      if (text && verifiedText !== text.trim()) {
        throw new Error("WhatsApp message box changed the text, so the message was not sent.");
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
    if (Date.now() - lastSyncAt < 1000) return;
    let audioCandidates = [];
    busy = true;
    try {
      let target = null;

      if (activeTarget?.clientId) {
        target = clients.find((item) => String(item.clientId) === String(activeTarget.clientId)) || null;
      }

      if (!target) {
        lastSyncAt = Date.now();
        return;
      }

      const messages = extractRecentInbound(target);
      audioCandidates = extractRecentAudio(target);
      if (messages.length) {
        await chrome.runtime.sendMessage({ type: "WA_INBOUND_BATCH", messages });
      }
      lastSyncAt = Date.now();
    } catch {
      lastSyncAt = Date.now();
    } finally {
      busy = false;
      if (audioCandidates.length) void processAudioCandidates(audioCandidates);
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

    if (message.type === "WA_READY_CHECK") {
      sendResponse({ ok: true, ready: whatsappReady() });
      return false;
    }

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

  window.setInterval(tick, 1000);
  window.setTimeout(tick, 1000);
})();
