const MAX_IMAGE_BYTES = 18 * 1024 * 1024;
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(["apiKey", "cleanupMode", "sourceLanguage"]);
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "mita-translate-image", title: "Terjemahkan gambar dengan Manga Indo", contexts: ["image"] });
    chrome.contextMenus.create({ id: "mita-edit-image", title: "Edit gambar dengan Manga Indo", contexts: ["image"] });
    chrome.contextMenus.create({ id: "mita-area", title: "Terjemahkan area yang dipilih", contexts: ["page", "selection"] });
    chrome.contextMenus.create({ id: "mita-auto", title: "Aktif/nonaktifkan Auto-translate situs ini", contexts: ["page"] });
  });
});

function notifyTab(tabId, message) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.autoSites) return;
  const sites = changes.autoSites.newValue || {};
  chrome.tabs.query({}).then(tabs => {
    tabs.forEach(tab => notifyTab(tab.id, { type: "SITE_AUTO_CHANGED", sites }));
  }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const actions = {
    "mita-translate-image": "TRANSLATE_CONTEXT_IMAGE",
    "mita-edit-image": "EDIT_CONTEXT_IMAGE",
    "mita-area": "START_AREA_SELECTION",
    "mita-auto": "TOGGLE_SITE_AUTO"
  };
  const type = actions[info.menuItemId];
  if (type) notifyTab(tab?.id, { type, srcUrl: info.srcUrl || "" });
});

chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const types = {
    "toggle-auto": "TOGGLE_SITE_AUTO",
    "select-area": "START_AREA_SELECTION",
    "toggle-original": "TOGGLE_ORIGINALS"
  };
  if (types[command]) notifyTab(tab.id, { type: types[command] });
});

function dataUrlParts(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Format gambar tidak didukung.");
  if (match[2].length > MAX_IMAGE_BYTES * 4 / 3 + 4) throw new Error("Gambar terlalu besar (maksimum 18 MB).");
  return { mimeType: match[1], data: match[2] };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64ToBlob(base64, mimeType) {
  return new Blob([base64ToBytes(base64)], { type: mimeType });
}

async function getImagePayload(message) {
  if (message.imageDataUrl) return dataUrlParts(message.imageDataUrl);

  const url = new URL(message.imageUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Jenis URL gambar ini belum didukung. Gunakan gambar HTTP/HTTPS.");
  }

  const hasPermission = await chrome.permissions.contains({ origins: [url.origin + "/*"] });
  if (!hasPermission) {
    throw new Error("Izin gambar belum diberikan. Buka popup extension dan klik Izinkan situs & CDN.");
  }

  const response = await fetch(url.href, { method: "GET", credentials: "include", cache: "force-cache", signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error("Gagal mengambil gambar dari situs manga (" + response.status + ").");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("URL tidak mengembalikan file gambar.");
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("Gambar terlalu besar (maksimum 18 MB).");
  return { mimeType: blob.type || "image/jpeg", data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
}

async function imageDimensions(payload) {
  const bitmap = await createImageBitmap(base64ToBlob(payload.data, payload.mimeType));
  const result = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return result;
}

async function cropPayload(payload, area) {
  if (!area) return payload;
  if (![area.x, area.y, area.width, area.height].every(Number.isFinite) || area.width <= 0 || area.height <= 0) throw new Error("Area gambar tidak valid.");
  const bitmap = await createImageBitmap(base64ToBlob(payload.data, payload.mimeType));
  const x = Math.max(0, Math.min(bitmap.width - 1, Math.round(area.x * bitmap.width)));
  const y = Math.max(0, Math.min(bitmap.height - 1, Math.round(area.y * bitmap.height)));
  const width = Math.max(1, Math.min(bitmap.width - x, Math.round(area.width * bitmap.width)));
  const height = Math.max(1, Math.min(bitmap.height - y, Math.round(area.height * bitmap.height)));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  bitmap.close();
  const output = await canvas.convertToBlob({ type: "image/png" });
  return { mimeType: "image/png", data: bytesToBase64(new Uint8Array(await output.arrayBuffer())) };
}

async function captureSelectedArea(tab, rect, dpr) {
  if (!tab || typeof tab.windowId !== "number") {
    throw new Error("Tab aktif tidak ditemukan untuk mengambil area layar.");
  }

  let screenshot;
  try {
    screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png"
    });
  } catch (_) {
    throw new Error("Chrome tidak memberi izin screenshot. Buka popup extension, lalu mulai pemilihan area lagi.");
  }

  const source = dataUrlParts(screenshot);
  const bitmap = await createImageBitmap(base64ToBlob(source.data, source.mimeType));
  const scale = Math.max(0.5, Math.min(4, Number(dpr) || 1));
  const x = Math.max(0, Math.min(bitmap.width - 1, Math.round(Number(rect.left) * scale)));
  const y = Math.max(0, Math.min(bitmap.height - 1, Math.round(Number(rect.top) * scale)));
  const width = Math.max(1, Math.min(bitmap.width - x, Math.round(Number(rect.width) * scale)));
  const height = Math.max(1, Math.min(bitmap.height - y, Math.round(Number(rect.height) * scale)));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return "data:image/png;base64," + bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

let creatingOffscreen;
async function ensureEngineDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: "engine.html", reasons: ["BLOBS"],
      justification: "Process local image blobs and retain translation jobs while the service worker sleeps."
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function engineMessage(message) {
  await ensureEngineDocument();
  return chrome.runtime.sendMessage({ ...message, target: "mita-engine" });
}

async function processImage(message, sender) {
  const saved = await chrome.storage.local.get(["targetLanguage"]);
  const payload = await cropPayload(await getImagePayload(message), message.area);
  return engineMessage({
    type: "START_JOB", payload,
    targetLanguage: saved.targetLanguage || "id",
    owner: sender.tab?.id ?? "popup"
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "mita-engine") return;
  if (message?.type === "CHECK_ENGINE" || message?.type === "GET_JOB" || message?.type === "RELEASE_JOB") {
    engineMessage({ type: message.type, jobId: message.jobId, owner: sender.tab?.id ?? "popup" })
      .then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "GET_SITE_AUTO") {
    chrome.storage.local.get(["autoSites"])
      .then(data => sendResponse({ ok: true, enabled: Boolean(data.autoSites?.[message.hostname]) }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SET_SITE_AUTO") {
    chrome.storage.local.get(["autoSites"]).then(async data => {
      const sites = data.autoSites || {};
      sites[message.hostname] = Boolean(message.enabled);
      await chrome.storage.local.set({ autoSites: sites });
      sendResponse({ ok: true, enabled: Boolean(message.enabled) });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "PROCESS_MANGA_IMAGE") {
    processImage(message, sender)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error?.message || "Terjemahan gagal." }));
    return true;
  }

  if (message?.type === "CAPTURE_SELECTED_AREA") {
    captureSelectedArea(sender.tab, message.rect || {}, message.dpr)
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(error => sendResponse({ ok: false, error: error?.message || "Gagal mengambil area layar." }));
    return true;
  }

  if (message?.type === "GET_IMAGE_DATA") {
    getImagePayload(message)
      .then(payload => sendResponse({
        ok: true,
        dataUrl: "data:" + payload.mimeType + ";base64," + payload.data
      }))
      .catch(error => sendResponse({ ok: false, error: error?.message || "Gagal mengambil gambar." }));
    return true;
  }

  if (message?.type === "DOWNLOAD_IMAGE") {
    chrome.downloads.download({
      url: message.dataUrl,
      filename: message.filename || "manga-indo-translated.png",
      saveAs: true
    }).then(downloadId => sendResponse({ ok: true, downloadId }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_IMAGE_ORIGINS") {
    const origins = Array.isArray(message.origins) ? message.origins : [];
    chrome.permissions.contains({ origins })
      .then(granted => sendResponse({ ok: true, granted }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
