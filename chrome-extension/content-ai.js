(() => {
  const platform = location.hostname.includes("claude.ai") ? "claude" : "chatgpt";
  let lastSubmitted = "";
  let lastSubmittedAt = 0;
  let lastGenerationState = null;
  let generationTimer = null;

  function readComposer() {
    const selectors = platform === "chatgpt"
      ? ["#prompt-textarea", "textarea", '[contenteditable="true"]']
      : ['[contenteditable="true"]', "textarea"];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        const element = node;
        const text = element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
          ? element.value
          : element.textContent || "";
        const value = text.trim();
        if (value) return value;
      }
    }
    return "";
  }

  function isComposerTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("#prompt-textarea, textarea, [contenteditable='true']"));
  }

  function submitPrompt() {
    const text = readComposer();
    if (!text) return;
    const now = Date.now();
    if (text === lastSubmitted && now - lastSubmittedAt < 2000) return;
    lastSubmitted = text;
    lastSubmittedAt = now;
    chrome.runtime.sendMessage({
      type: "AI_PROMPT_SUBMITTED",
      platform,
      promptText: text,
      submittedAt: new Date().toISOString(),
    });
  }

  function buttonLooksLikeStop(button) {
    const label = [
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.getAttribute("data-testid"),
      button.textContent,
    ].filter(Boolean).join(" ").trim().toLowerCase();

    if (platform === "chatgpt") {
      return button.matches('[data-testid="stop-button"]') ||
        /stop streaming|stop generating|stop response/.test(label);
    }

    return /stop generating|stop response|^stop$|^stop\b/.test(label);
  }

  function isGenerating() {
    return Array.from(document.querySelectorAll("button")).some((button) => buttonLooksLikeStop(button));
  }

  function publishGenerationState(force = false) {
    const next = isGenerating();
    if (!force && next === lastGenerationState) return;
    lastGenerationState = next;
    chrome.runtime.sendMessage({
      type: "AI_GENERATION_STATE",
      platform,
      generating: next,
      at: new Date().toISOString(),
    });
  }

  function scheduleGenerationCheck() {
    if (generationTimer) window.clearTimeout(generationTimer);
    generationTimer = window.setTimeout(() => publishGenerationState(false), 250);
  }

  const observer = new MutationObserver(scheduleGenerationCheck);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-label", "title", "data-testid", "disabled"],
  });

  document.addEventListener("submit", () => submitPrompt(), true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (!isComposerTarget(event.target)) return;
    queueMicrotask(submitPrompt);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button");
    if (!button) return;
    const label = [
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.getAttribute("data-testid"),
      button.textContent,
    ].filter(Boolean).join(" ").toLowerCase();
    if (/(send|submit|send message|send prompt)/.test(label)) submitPrompt();
    scheduleGenerationCheck();
  }, true);

  window.setTimeout(() => publishGenerationState(true), 600);
})();