function extractPairingCode(value) {
  const match = String(value || "").match(/FHQW1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return match ? match[0] : "";
}

function decodeOrigin(code) {
  const parts = code.split(".");
  if (parts.length !== 3 || parts[0] !== "FHQW1") throw new Error("Invalid WhatsApp Bridge pairing code.");
  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const origin = atob(padded);
  return new URL(origin).origin;
}

async function state() {
  return chrome.runtime.sendMessage({ type: "GET_STATE" });
}

async function refresh() {
  const current = await state();
  const pairedView = document.getElementById("pairedView");
  const pairView = document.getElementById("pairView");
  if (current?.paired) {
    pairedView.classList.remove("hidden");
    pairView.classList.add("hidden");
    document.getElementById("pairedDetails").textContent =
      (current.deviceLabel || "Chrome") + " · " + (current.clientCount || 0) + " approved client chats";
  } else {
    pairedView.classList.add("hidden");
    pairView.classList.remove("hidden");
  }
}

document.getElementById("pairButton").addEventListener("click", async () => {
  const message = document.getElementById("message");
  message.textContent = "";
  try {
    const pairingCode = extractPairingCode(document.getElementById("pairCode").value);
    if (!pairingCode) throw new Error("Paste the complete FHQW1 pairing code.");
    const appOrigin = decodeOrigin(pairingCode);
    const permission = await chrome.permissions.request({ origins: [appOrigin + "/*"] });
    if (!permission) throw new Error("App permission is required to connect the bridge.");
    const result = await chrome.runtime.sendMessage({
      type: "PAIR",
      pairingCode,
      appOrigin,
      deviceLabel: document.getElementById("deviceLabel").value.trim(),
    });
    if (!result?.ok) throw new Error(result?.error || "Pairing failed.");
    await refresh();
  } catch (error) {
    message.textContent = error?.message || "Pairing failed.";
  }
});

document.getElementById("openWhatsapp").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://web.whatsapp.com/" });
});

document.getElementById("disconnect").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "DISCONNECT" });
  await refresh();
});

refresh();
