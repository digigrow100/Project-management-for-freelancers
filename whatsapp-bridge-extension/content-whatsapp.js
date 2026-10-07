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
    document.execCommand("insertText", false, value);
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value,
    }));
  }

  function targetQuery(target) {
    return String(target.chatKey || target.chatLabel || target.phone || "").trim();
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

  async function openClient(target) {
    const query = targetQuery(target);
    if (!query) throw new Error("Client WhatsApp chat mapping is empty.");

    const search = searchBox();
    if (!search) throw new Error("WhatsApp search box was not found.");
    setEditableText(search, query);
    await sleep(900);

    const needles = [target.chatLabel, target.chatKey, target.phone, query]
      .map(normalize)
      .filter(Boolean);
    const rows = candidateRows();
    const row = rows.find((item) => {
      const text = normalize(item.textContent);
      return needles.some((needle) => text.includes(needle));
    });
    if (!row) {
      setEditableText(search, "");
      throw new Error("WhatsApp chat not found for " + query + ".");
    }

    row.click();
    await sleep(900);
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

  function inboundContainers() {
    const direct = Array.from(document.querySelectorAll("div.message-in"));
    if (direct.length) return direct;
    return Array.from(document.querySelectorAll('[data-testid="msg-container"]')).filter((node) => {
      const classes = String(node.className || "");
      return classes.includes("message-in") || node.closest(".message-in");
    });
  }

  function extractInbound(target) {
    const containers = inboundContainers().slice(-40);
    const now = new Date().toISOString();
    return containers.map((node, index) => {
      const textNode =
        node.querySelector('[data-testid="msg-text"]') ||
        node.querySelector(".selectable-text") ||
        node.querySelector('span[dir="ltr"]');
      const body = String(textNode?.textContent || "").trim();
      if (!body) return null;
      const rawId =
        node.getAttribute("data-id") ||
        node.querySelector("[data-id]")?.getAttribute("data-id") ||
        node.getAttribute("data-testid") ||
        "";
      const remoteMessageKey = rawId
        ? "wa:" + rawId
        : "wa-fallback:" + simpleHash(target.clientId + "|" + body + "|" + index);
      return {
        clientId: target.clientId,
        body,
        remoteMessageKey,
        receivedAt: now,
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
      const messages = extractInbound(target);
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

  async function sendMessage(message) {
    if (busy) {
      for (let i = 0; i < 20 && busy; i += 1) await sleep(250);
    }
    busy = true;
    try {
      await openClient(message);
      const composer = composerBox();
      if (!composer) throw new Error("WhatsApp message composer was not found.");
      setEditableText(composer, String(message.body || ""));
      await sleep(250);

      const sendButton =
        document.querySelector('[data-testid="compose-btn-send"]') ||
        document.querySelector('button[aria-label*="Send"]') ||
        document.querySelector('[data-icon="send"]')?.closest("button,div[role='button']");
      if (sendButton) {
        sendButton.click();
      } else {
        composer.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
        }));
      }
      await sleep(700);
      return { ok: true, remoteMessageKey: "outbound:" + message.id };
    } catch (error) {
      return { ok: false, error: error?.message || "Could not send WhatsApp message." };
    } finally {
      busy = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    if (message.type === "WA_CONFIG") {
      clients = Array.isArray(message.clients) ? message.clients : [];
      sendResponse({ ok: true, clientCount: clients.length });
      return false;
    }

    if (message.type === "WA_SEND_MESSAGE") {
      sendMessage(message.message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || "Send failed." }));
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
