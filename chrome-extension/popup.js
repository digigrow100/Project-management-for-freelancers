function decodeOrigin(code) {
  const parts = code.trim().split(".");
  if (parts[0] !== "FHQ1" || !parts[1]) throw new Error("Invalid pairing code.");
  let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const origin = atob(base64);
  return new URL(origin).origin;
}

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function refresh() {
  const state = await sendMessage({ type: "GET_STATE" });
  const pairView = document.getElementById("pairView");
  const pairedView = document.getElementById("pairedView");
  if (state?.paired) {
    pairView.hidden = true;
    pairedView.hidden = false;
    document.getElementById("employeeName").textContent = state.employee?.name || state.employee?.email || "Employee";
    document.getElementById("statusText").textContent = "Paired to employee account";
    document.getElementById("currentSite").textContent = state.currentInterval?.url || "Waiting for active tab…";
  } else {
    pairView.hidden = false;
    pairedView.hidden = true;
  }
}

document.getElementById("pairButton").addEventListener("click", async () => {
  const button = document.getElementById("pairButton");
  const error = document.getElementById("pairError");
  const pairingCode = document.getElementById("pairingCode").value.trim();
  error.textContent = "";
  try {
    const appOrigin = decodeOrigin(pairingCode);
    button.disabled = true;
    button.textContent = "Pairing…";
    const granted = await chrome.permissions.request({ origins: [appOrigin + "/*"] });
    if (!granted) throw new Error("Permission to connect to the Project Management App was not granted.");
    const response = await sendMessage({
      type: "PAIR",
      pairingCode,
      appOrigin,
      deviceLabel: navigator.platform || "Chrome",
    });
    if (!response?.ok) throw new Error(response?.error || "Pairing failed.");
    await refresh();
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : "Pairing failed.";
  } finally {
    button.disabled = false;
    button.textContent = "Pair this Chrome";
  }
});

document.getElementById("shareButton").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("share.html") });
});

document.getElementById("openAppButton").addEventListener("click", async () => {
  const state = await sendMessage({ type: "GET_STATE" });
  if (state?.appOrigin) chrome.tabs.create({ url: state.appOrigin });
});

document.getElementById("disconnectButton").addEventListener("click", async () => {
  if (!confirm("Disconnect this extension installation from the employee account?")) return;
  await sendMessage({ type: "DISCONNECT" });
  await refresh();
});

void refresh();
