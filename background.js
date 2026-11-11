const DEFAULT_MODEL = "gemini-3.8-flash";
const REQUEST_TIMEOUT_MS = 45000;
const MAX_RETRIES = 2;

chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});

const PROMPT = `
You are a manga and comic dialogue detector and Indonesian translator.
Inspect only the manga/comic artwork visible in the supplied screenshot.
Ignore browser controls, website navigation, buttons, comments, advertisements, watermarks, and other page UI.

Detect readable dialogue and narration inside speech balloons, thought balloons, and narration boxes. The source language may be Japanese, English, Korean, Chinese, or another language. Read vertical Japanese text in the correct order when possible.

For each detected dialogue or narration region:
- Translate the meaning into natural, concise Indonesian.
- Preserve names, honorifics when meaningful, tone, emotion, punctuation, and speaker intent.
- Keep separate balloons as separate results.
- Do not guess unreadable or missing words.
- Do not translate sound effects, logos, credits, or ordinary website text.
- Do not include a region unless it contains readable dialogue or narration.
- Draw the box around the inside of the balloon or narration area, with a small margin so its outline remains visible.

Coordinates must be normalized from 0 to 1000 relative to the FULL screenshot:
x = left, y = top, w = width, h = height.
Return ONLY valid JSON in this exact shape:
{"bubbles":[{"x":100,"y":120,"w":220,"h":90,"text":"Terjemahan bahasa Indonesia"}]}
If no readable dialogue or narration is visible, return {"bubbles":[]}.
Do not include markdown fences or commentary.
`;

function extractText(response) {
  return (response?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
}

function parseJson(text) {
  const cleaned = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Gemini tidak mengembalikan JSON yang valid. Coba terjemahkan ulang.");
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("Format hasil Gemini tidak terbaca. Coba terjemahkan ulang.");
  }
}

function cleanBubbles(data) {
  const source = Array.isArray(data?.bubbles) ? data.bubbles : [];

  return source.slice(0, 35).map(item => {
    const number = key => {
      const value = Number(item?.[key]);
      return Number.isFinite(value) ? value : 0;
    };

    const x = Math.round(Math.max(0, Math.min(999, number("x"))));
    const y = Math.round(Math.max(0, Math.min(999, number("y"))));
    const w = Math.round(Math.max(0, Math.min(1000 - x, number("w"))));
    const h = Math.round(Math.max(0, Math.min(1000 - y, number("h"))));
    const text = String(item?.text || "").replace(/\s+/g, " ").trim().slice(0, 450);

    return { x, y, w, h, text };
  }).filter(item => item.text && item.w >= 2 && item.h >= 2);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getApiErrorMessage(status, apiMessage) {
  if (status === 400) return "Permintaan Gemini ditolak. Periksa API key dan konfigurasi model.";
  if (status === 401 || status === 403) return "API key Gemini tidak valid atau tidak memiliki izin. Periksa key di Google AI Studio.";
  if (status === 404) return "Model Gemini tidak ditemukan. Periksa nama model yang digunakan.";
  if (status === 429) return "Kuota atau batas request Gemini tercapai. Tunggu sebentar, lalu coba lagi.";
  if (status >= 500) return "Server Gemini sedang bermasalah. Coba lagi beberapa saat.";
  return apiMessage || `Gemini API error (${status}).`;
}

async function requestGemini({ apiKey, model, mimeType, imageData }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: imageData } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            maxOutputTokens: 4096
          }
        })
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok) return result;

      const apiMessage = result?.error?.message || "";
      const retryable = [429, 500, 502, 503, 504].includes(response.status);

      if (retryable && attempt < MAX_RETRIES) {
        await wait(700 * (attempt + 1));
        continue;
      }

      throw new Error(getApiErrorMessage(response.status, apiMessage));
    } catch (error) {
      if (error?.name === "AbortError") {
        if (attempt < MAX_RETRIES) {
          await wait(700 * (attempt + 1));
          continue;
        }
        throw new Error("Waktu tunggu Gemini habis. Coba lagi dengan koneksi yang lebih stabil.");
      }

      if (error instanceof TypeError && attempt < MAX_RETRIES) {
        await wait(700 * (attempt + 1));
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error("Gemini belum memberi hasil. Coba terjemahkan ulang.");
}

async function translateScreenshot(tab) {
  if (!tab?.id || typeof tab.windowId !== "number") {
    throw new Error("Tab aktif tidak ditemukan.");
  }

  const activeTabs = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (!activeTabs[0] || activeTabs[0].id !== tab.id) {
    throw new Error("Aktifkan kembali tab manga sebelum menerjemahkan.");
  }

  const saved = await chrome.storage.local.get(["apiKey", "model"]);
  const apiKey = String(saved.apiKey || "").trim();
  const model = String(saved.model || DEFAULT_MODEL).trim();

  if (!apiKey) throw new Error("Gemini API key belum disimpan di extension.");
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    throw new Error("Nama model Gemini tidak valid.");
  }

  let screenshot;
  try {
    screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 82
    });
  } catch {
    throw new Error("Gagal mengambil layar. Pastikan tab manga sedang aktif, lalu coba lagi.");
  }

  const match = String(screenshot || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Gambar layar tidak dapat dibaca.");

  const result = await requestGemini({
    apiKey,
    model,
    mimeType: match[1],
    imageData: match[2]
  });

  const text = extractText(result);
  if (!text) {
    const reason = result?.candidates?.[0]?.finishReason;
    if (reason === "SAFETY") {
      throw new Error("Gemini tidak dapat memproses gambar ini karena pembatasan keamanan.");
    }
    throw new Error("Gemini tidak memberi hasil. Periksa kuota API, lalu coba lagi.");
  }

  return cleanBubbles(parseJson(text));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "TRANSLATE_VIEW") return;

  translateScreenshot(sender.tab)
    .then(bubbles => sendResponse({ ok: true, bubbles }))
    .catch(error => {
      sendResponse({
        ok: false,
        error: error?.message || "Terjadi kesalahan saat menerjemahkan."
      });
    });

  return true;
});
