const OCR_MODEL = "gemini-3.8-flash";
const IMAGE_MODEL = "gemini-3.1-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const REQUEST_TIMEOUT_MS = 120000;
const MAX_IMAGE_BYTES = 18 * 1024 * 1024;

chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
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

  const response = await fetch(url.href, { method: "GET", credentials: "include", cache: "force-cache" });
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

async function geminiRequest(model, parts, generationConfig, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(API_BASE + model + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result?.error?.message || "Gemini API error.";
      if (response.status === 401 || response.status === 403) throw new Error("API key Gemini tidak valid atau tidak memiliki akses ke model ini.");
      if (response.status === 429) throw new Error("Kuota atau batas request Gemini API tercapai. Periksa Google AI Studio.");
      throw new Error("Gemini API " + response.status + ": " + message);
    }
    return result;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Gemini terlalu lama merespons. Coba gambar yang lebih kecil.");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractText(result) {
  return (result?.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("").trim();
}

function parseJson(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "").replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model tidak mengembalikan data OCR yang valid.");
  return JSON.parse(clean.slice(start, end + 1));
}

function languageName(code) {
  const names = {
    id: "Indonesian", en: "English", ja: "Japanese", ko: "Korean", zh: "Chinese",
    es: "Spanish", fr: "French", pt: "Portuguese", de: "German", ru: "Russian",
    it: "Italian", vi: "Vietnamese", th: "Thai", ar: "Arabic", tr: "Turkish"
  };
  return names[code] || code || "Indonesian";
}

function normalizeRegions(data) {
  const source = Array.isArray(data?.regions) ? data.regions : [];
  return source.slice(0, 60).map((item, index) => {
    const box = Array.isArray(item.box) ? item.box : [];
    const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const x = Math.max(0, Math.min(999, n(box[0])));
    const y = Math.max(0, Math.min(999, n(box[1])));
    const w = Math.max(0, Math.min(1000 - x, n(box[2])));
    const h = Math.max(0, Math.min(1000 - y, n(box[3])));
    return {
      id: index + 1, x, y, w, h,
      sourceText: String(item.sourceText || "").trim().slice(0, 600),
      translation: String(item.translation || "").trim().slice(0, 600),
      kind: ["bubble", "caption", "narration"].includes(item.kind) ? item.kind : "bubble",
      style: {
        color: /^#[0-9a-f]{6}$/i.test(item.style?.color || "") ? item.style.color : "#111111",
        outline: /^#[0-9a-f]{6}$/i.test(item.style?.outline || "") ? item.style.outline : "#ffffff",
        weight: item.style?.weight === "normal" ? "normal" : "bold",
        italic: Boolean(item.style?.italic)
      }
    };
  }).filter(region => region.translation && region.w >= 2 && region.h >= 2);
}

async function detectAndTranslate(payload, settings, apiKey) {
  const target = languageName(settings.targetLanguage || "id");
  const source = settings.sourceLanguage === "auto"
    ? "Detect the source language automatically."
    : "The source language is " + languageName(settings.sourceLanguage) + ".";

  const prompt = [
    "You are a professional manga lettering detector and manga translator.",
    "Inspect this full manga/comic page. Find readable dialogue inside speech bubbles and readable text in caption/narration boxes.",
    source,
    "Translate every detected region into " + target + ". Preserve meaning, character names, honorifics when relevant, tone, emotion and speaker intent.",
    "Keep each bubble as a separate region. Do not combine different speakers.",
    "Do not include sound effects, logos, credits, page numbers, signatures or decorative lettering. Leave sound effects untouched.",
    "Do not guess unreadable text. Skip any region that cannot be read with confidence.",
    "For every region, return a tight rectangle around the lettering INSIDE its bubble or caption, not around the whole panel. Coordinates are normalized 0-1000 relative to the full image: [left, top, width, height].",
    "Estimate lettering style: color is text ink color, outline is outline color if present, weight is bold or normal, italic true/false.",
    'Return only JSON: {"detectedLanguage":"en","regions":[{"box":[120,100,220,110],"sourceText":"Hello","translation":"Halo","kind":"bubble","style":{"color":"#111111","outline":"#ffffff","weight":"bold","italic":false}}]}',
    'If no readable dialogue/caption is found, return {"detectedLanguage":"unknown","regions":[]}.'
  ].join("\n");

  const result = await geminiRequest(
    OCR_MODEL,
    [{ text: prompt }, { inline_data: { mime_type: payload.mimeType, data: payload.data } }],
    { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 8192 },
    apiKey
  );

  const parsed = parseJson(extractText(result));
  return { detectedLanguage: parsed.detectedLanguage || "unknown", regions: normalizeRegions(parsed) };
}

function buildCleanupPrompt(regions) {
  const targets = regions.map(region => ({
    box: [region.x, region.y, region.w, region.h],
    original: region.sourceText,
    kind: region.kind
  }));

  return [
    "Edit this exact manga page image. This is a precise image-restoration task, not a redraw.",
    "Erase ONLY the original dialogue lettering inside the listed speech-bubble/caption rectangles and reconstruct the background underneath each removed letter.",
    "Preserve the original page composition, dimensions, panel borders, character faces, line art, screentones, shadows, colors, bubble outlines and every non-text pixel as closely as possible.",
    "Do not add any words, letters, symbols, sound effects or replacement text. Do not translate. The extension will typeset the translation afterward.",
    "Do not remove sound effects or text outside the listed rectangles.",
    "Keep every speech-bubble outline intact. Fill erased lettering with surrounding bubble/background texture, not a white rectangle.",
    "Detected regions (coordinates normalized 0-1000): " + JSON.stringify(targets),
    "Return one cleaned image with the same page orientation and aspect ratio."
  ].join("\n");
}

async function simpleClean(payload, regions) {
  const bitmap = await createImageBitmap(base64ToBlob(payload.data, payload.mimeType));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  for (const region of regions) {
    const x = Math.round(region.x / 1000 * canvas.width);
    const y = Math.round(region.y / 1000 * canvas.height);
    const w = Math.max(1, Math.round(region.w / 1000 * canvas.width));
    const h = Math.max(1, Math.round(region.h / 1000 * canvas.height));
    const insetX = Math.max(2, Math.round(w * 0.04));
    const insetY = Math.max(2, Math.round(h * 0.04));
    const sx = Math.min(canvas.width - 1, x + insetX);
    const sy = Math.min(canvas.height - 1, y + insetY);
    const sample = ctx.getImageData(sx, sy, 1, 1).data;
    ctx.fillStyle = "rgb(" + sample[0] + "," + sample[1] + "," + sample[2] + ")";
    ctx.fillRect(x + insetX, y + insetY, Math.max(1, w - insetX * 2), Math.max(1, h - insetY * 2));
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return { mimeType: "image/png", data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
}

async function aiClean(payload, regions, apiKey) {
  const result = await geminiRequest(
    IMAGE_MODEL,
    [{ text: buildCleanupPrompt(regions) }, { inline_data: { mime_type: payload.mimeType, data: payload.data } }],
    { responseModalities: ["TEXT", "IMAGE"] },
    apiKey
  );

  const parts = result?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(part => part.inlineData?.data || part.inline_data?.data);
  if (!imagePart) throw new Error("Model gambar tidak mengembalikan hasil restorasi.");
  const inline = imagePart.inlineData || imagePart.inline_data;
  return { mimeType: inline.mimeType || inline.mime_type || "image/png", data: inline.data };
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

async function typesetTranslations(cleaned, originalDimensions, regions) {
  const bitmap = await createImageBitmap(base64ToBlob(cleaned.data, cleaned.mimeType));
  const width = originalDimensions.width;
  const height = originalDimensions.height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const region of regions) {
    const x = region.x / 1000 * width;
    const y = region.y / 1000 * height;
    const w = region.w / 1000 * width;
    const h = region.h / 1000 * height;
    const padding = Math.max(3, Math.min(w, h) * 0.08);
    const maxWidth = Math.max(8, w - padding * 2);
    const maxHeight = Math.max(8, h - padding * 2);
    let fontSize = Math.max(9, Math.min(46, h * 0.24));
    let lines = [];

    while (fontSize >= 7) {
      ctx.font = (region.style.italic ? "italic " : "") +
        (region.style.weight === "bold" ? "700 " : "400 ") + fontSize + "px Arial, sans-serif";
      lines = wrapText(ctx, region.translation, maxWidth);
      if (lines.length * fontSize * 1.16 <= maxHeight) break;
      fontSize -= 1;
    }

    ctx.save();
    ctx.font = (region.style.italic ? "italic " : "") +
      (region.style.weight === "bold" ? "700 " : "400 ") + Math.max(7, fontSize) + "px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    const lineHeight = Math.max(8, Math.max(7, fontSize) * 1.16);
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const firstY = centerY - ((lines.length - 1) * lineHeight) / 2;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const lineY = firstY + i * lineHeight;
      ctx.lineWidth = Math.max(1, fontSize * 0.055);
      ctx.strokeStyle = region.style.outline;
      ctx.strokeText(line, centerX, lineY, maxWidth);
      ctx.fillStyle = region.style.color;
      ctx.fillText(line, centerX, lineY, maxWidth);
    }
    ctx.restore();
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return "data:image/png;base64," + bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

async function processImage(message) {
  const saved = await chrome.storage.local.get(["apiKey", "targetLanguage", "sourceLanguage", "cleanupMode"]);
  const apiKey = String(saved.apiKey || "").trim();
  if (!apiKey) throw new Error("Masukkan Gemini API key di popup extension terlebih dahulu.");

  const settings = {
    targetLanguage: message.targetLanguage || saved.targetLanguage || "id",
    sourceLanguage: message.sourceLanguage || saved.sourceLanguage || "auto",
    cleanupMode: saved.cleanupMode || "ai"
  };

  const fullPayload = await getImagePayload(message);
  const originalDimensions = await imageDimensions(fullPayload);
  const payload = await cropPayload(fullPayload, message.area);
  const detection = await detectAndTranslate(payload, settings, apiKey);

  if (!detection.regions.length) {
    return { ok: true, noText: true, dataUrl: null, regions: [], detectedLanguage: detection.detectedLanguage };
  }

  let cleaned;
  let cleanupWarning = "";
  if (settings.cleanupMode === "ai") {
    try {
      cleaned = await aiClean(payload, detection.regions, apiKey);
    } catch (error) {
      cleaned = await simpleClean(payload, detection.regions);
      cleanupWarning = "Restorasi AI gagal; memakai pembersihan sederhana. " + error.message;
    }
  } else {
    cleaned = await simpleClean(payload, detection.regions);
  }

  const dimensions = message.area ? await imageDimensions(payload) : originalDimensions;
  const dataUrl = await typesetTranslations(cleaned, dimensions, detection.regions);

  return {
    ok: true, noText: false, dataUrl, regions: detection.regions,
    detectedLanguage: detection.detectedLanguage, cleanupWarning, dimensions
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PROCESS_MANGA_IMAGE") {
    processImage(message)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error?.message || "Terjemahan gagal." }));
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
