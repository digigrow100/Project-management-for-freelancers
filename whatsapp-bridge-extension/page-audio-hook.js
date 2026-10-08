(() => {
  "use strict";

  let capture = null;
  let suppressUntil = 0;
  let requestSeq = 0;

  const CHANNEL = "__fhq_wa_audio__";

  function respond(id, payload) {
    window.postMessage({ channel: CHANNEL, direction: "response", id, ...payload }, "*");
  }

  function shouldSuppress() {
    return Date.now() < suppressUntil;
  }

  async function tryCaptureFromUrl(url) {
    if (!capture || capture.done) return;
    if (typeof url !== "string" || !url.startsWith("blob:")) return;

    capture.done = true;
    const captureId = capture.id;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not read voice-note blob.");
      const blob = await response.blob();
      if (!blob || !blob.size) throw new Error("Voice-note blob was empty.");
      if (blob.size > 2500000) throw new Error("Voice note is too large to process safely.");
      respond(captureId, {
        ok: true,
        blob,
        mimeType: blob.type || "audio/ogg",
        size: blob.size,
      });
    } catch (error) {
      respond(captureId, {
        ok: false,
        error: error instanceof Error ? error.message : "Voice-note capture failed.",
      });
    }
  }

  const originalPlay = HTMLMediaElement.prototype.play;
  const originalPause = HTMLMediaElement.prototype.pause;

  HTMLMediaElement.prototype.play = function () {
    try {
      void tryCaptureFromUrl(this.currentSrc || this.src || "");
    } catch {}

    if (shouldSuppress()) {
      try {
        originalPause.call(this);
        this.currentTime = 0;
      } catch {}
      return Promise.resolve();
    }

    return originalPlay.apply(this, arguments);
  };

  try {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    if (descriptor?.set && descriptor.get) {
      Object.defineProperty(HTMLMediaElement.prototype, "src", {
        configurable: true,
        enumerable: descriptor.enumerable,
        get() {
          return descriptor.get.call(this);
        },
        set(value) {
          try {
            void tryCaptureFromUrl(value);
          } catch {}
          return descriptor.set.call(this, value);
        },
      });
    }
  } catch {}

  try {
    const OriginalAudio = window.Audio;
    const WrappedAudio = function (src) {
      const audio = new OriginalAudio(src);
      try {
        if (src) void tryCaptureFromUrl(src);
      } catch {}
      return audio;
    };
    WrappedAudio.prototype = OriginalAudio.prototype;
    Object.setPrototypeOf(WrappedAudio, OriginalAudio);
    window.Audio = WrappedAudio;
  } catch {}

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (
      event.source !== window ||
      !data ||
      data.channel !== CHANNEL ||
      data.direction !== "request"
    ) {
      return;
    }

    const id = data.id || ++requestSeq;
    const action = String(data.action || "");

    if (action === "ping") {
      respond(id, { ok: true, version: 1 });
      return;
    }

    if (action === "arm") {
      suppressUntil = Date.now() + 30000;
      capture = { id, done: false };
      return;
    }

    if (action === "disarm") {
      suppressUntil = 0;
      capture = null;
      respond(id, { ok: true });
    }
  });
})();
