const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
let peer = null;
let displayStream = null;
let micStream = null;
let sessionId = null;
let pollTimer = null;
let heartbeatTimer = null;
let lastSignalId = 0;

async function state() {
  return chrome.storage.local.get(["appOrigin", "deviceToken", "employee"]);
}

async function api(path, options = {}) {
  const auth = await state();
  if (!auth.appOrigin || !auth.deviceToken) throw new Error("Extension is not paired.");
  const headers = new Headers(options.headers || {});
  headers.set("content-type", "application/json");
  headers.set("authorization", "Bearer " + auth.deviceToken);
  return fetch(auth.appOrigin + path, { ...options, headers });
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function setSharing(active) {
  document.body.classList.toggle("sharing", active);
  const badge = document.getElementById("sharingBadge");
  badge.textContent = active ? "Screen Sharing Active" : "Not sharing";
  badge.className = active ? "badge on" : "badge off";
  document.getElementById("startButton").disabled = active;
  document.getElementById("stopButton").disabled = !active;
}

async function sendSignal(signalType, payload) {
  const response = await api("/api/extension/screen-share/signal", {
    method: "POST",
    body: JSON.stringify({ sessionId, signalType, payload }),
  });
  if (!response.ok) throw new Error("Could not send WebRTC signal.");
}

async function pollSignals() {
  if (!sessionId || !peer) return;
  try {
    const response = await api(
      "/api/extension/screen-share/signal?sessionId=" + encodeURIComponent(sessionId) + "&afterId=" + lastSignalId,
      { method: "GET" },
    );
    if (!response.ok) return;
    const data = await response.json();
    for (const signal of data.signals || []) {
      lastSignalId = Math.max(lastSignalId, signal.id);
      if (signal.signal_type === "answer") {
        await peer.setRemoteDescription(signal.payload);
        setStatus("Screen sharing active. Keep this page open.");
      } else if (signal.signal_type === "ice") {
        await peer.addIceCandidate(signal.payload).catch(() => undefined);
      }
    }
  } catch {
    setStatus("Connection retrying…");
  }
}

async function startSharing() {
  const micEnabled = document.getElementById("micToggle").checked;
  setStatus("Choose what you want to share in Chrome…");

  displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  if (micEnabled) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      micStream = null;
      setStatus("Microphone permission was not granted. Sharing screen without microphone.");
    }
  }

  const response = await api("/api/extension/screen-share/session", {
    method: "POST",
    body: JSON.stringify({ action: "start", microphoneEnabled: Boolean(micStream) }),
  });
  const data = await response.json();
  if (!response.ok || !data.sessionId) throw new Error(data.error || "Could not start screen share.");
  sessionId = data.sessionId;

  peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  for (const track of displayStream.getTracks()) peer.addTrack(track, displayStream);
  if (micStream) for (const track of micStream.getTracks()) peer.addTrack(track, micStream);

  peer.onicecandidate = (event) => {
    if (event.candidate) void sendSignal("ice", event.candidate.toJSON());
  };

  displayStream.getVideoTracks()[0]?.addEventListener("ended", () => void stopSharing());
  document.getElementById("preview").srcObject = displayStream;

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await sendSignal("offer", offer);

  lastSignalId = 0;
  pollTimer = setInterval(() => void pollSignals(), 1000);
  heartbeatTimer = setInterval(() => {
    if (!sessionId) return;
    void api("/api/extension/screen-share/session", {
      method: "POST",
      body: JSON.stringify({ action: "heartbeat", sessionId }),
    });
  }, 30000);

  setSharing(true);
  setStatus("Waiting for admin to open the live stream…");
}

async function stopSharing() {
  const endingSession = sessionId;
  sessionId = null;
  if (pollTimer) clearInterval(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  pollTimer = null;
  heartbeatTimer = null;

  for (const track of displayStream?.getTracks() || []) track.stop();
  for (const track of micStream?.getTracks() || []) track.stop();
  displayStream = null;
  micStream = null;
  document.getElementById("preview").srcObject = null;

  if (peer) peer.close();
  peer = null;

  if (endingSession) {
    await api("/api/extension/screen-share/session", {
      method: "POST",
      body: JSON.stringify({ action: "end", sessionId: endingSession }),
    }).catch(() => undefined);
  }

  setSharing(false);
  setStatus("Screen sharing stopped.");
}

document.getElementById("startButton").addEventListener("click", () => {
  startSharing().catch((error) => {
    setStatus(error instanceof Error ? error.message : "Screen sharing failed.");
    void stopSharing();
  });
});
document.getElementById("stopButton").addEventListener("click", () => void stopSharing());
window.addEventListener("beforeunload", () => {
  for (const track of displayStream?.getTracks() || []) track.stop();
  for (const track of micStream?.getTracks() || []) track.stop();
});

void state().then((auth) => {
  if (!auth.deviceToken) {
    setStatus("Pair the extension with your employee account first.");
    document.getElementById("startButton").disabled = true;
  }
});
