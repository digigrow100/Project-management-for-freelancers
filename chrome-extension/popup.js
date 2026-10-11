const PENDING_PAIRING_KEYS = ["pendingPairingCode", "pendingPairingOrigin"];

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

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(value) {
  return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

async function finishPairing(pairingCode, appOrigin) {
  const response = await sendMessage({
    type: "PAIR",
    pairingCode,
    appOrigin,
    deviceLabel: navigator.platform || "Chrome",
  });
  if (!response?.ok) throw new Error(response?.error || "Pairing failed.");
  await storageRemove(PENDING_PAIRING_KEYS);
  return response;
}

async function resumePendingPairing() {
  const pending = await storageGet(PENDING_PAIRING_KEYS);
  const pairingCode = String(pending.pendingPairingCode || "").trim();
  const appOrigin = String(pending.pendingPairingOrigin || "").trim();
  if (!pairingCode || !appOrigin) return false;

  const input = document.getElementById("pairingCode");
  if (input) input.value = pairingCode;

  let granted = false;
  try {
    granted = await chrome.permissions.contains({ origins: [appOrigin + "/*"] });
  } catch {
    granted = false;
  }
  if (!granted) return false;

  const button = document.getElementById("pairButton");
  const error = document.getElementById("pairError");
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Finishing pairing…";
    }
    if (error) error.textContent = "";
    await finishPairing(pairingCode, appOrigin);
    return true;
  } catch (err) {
    if (error) error.textContent = err instanceof Error ? err.message : "Pairing failed.";
    return false;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Pair this Chrome";
    }
  }
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
    await storageRemove(PENDING_PAIRING_KEYS);
    return;
  }

  pairView.hidden = false;
  pairedView.hidden = true;
  await resumePendingPairing();

  const latest = await sendMessage({ type: "GET_STATE" });
  if (latest?.paired) {
    pairView.hidden = true;
    pairedView.hidden = false;
    document.getElementById("employeeName").textContent = latest.employee?.name || latest.employee?.email || "Employee";
    document.getElementById("statusText").textContent = "Paired to employee account";
    document.getElementById("currentSite").textContent = latest.currentInterval?.url || "Waiting for active tab…";
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
    button.textContent = "Waiting for permission…";

    // Chrome can close the extension popup while it shows the host-permission
    // confirmation. Persist the pending code first so the user never has to
    // paste it a second time after clicking Allow.
    await storageSet({
      pendingPairingCode: pairingCode,
      pendingPairingOrigin: appOrigin,
    });

    const alreadyGranted = await chrome.permissions.contains({ origins: [appOrigin + "/*"] });
    const granted = alreadyGranted || await chrome.permissions.request({ origins: [appOrigin + "/*"] });
    if (!granted) {
      throw new Error("Permission to connect to the Project Management App was not granted. Your code is saved; click Pair this Chrome when ready.");
    }

    button.textContent = "Pairing…";
    await finishPairing(pairingCode, appOrigin);
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
  await storageRemove(PENDING_PAIRING_KEYS);
  await refresh();
});

void refresh();
