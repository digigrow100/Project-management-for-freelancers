(() => {
  const platform = location.hostname.includes("claude.ai") ? "claude" : "chatgpt";
  let lastSubmitted = "";
  let lastSubmittedAt = 0;

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
    if (!/(send|submit|send message|send prompt)/.test(label)) return;
    submitPrompt();
  }, true);
})();
