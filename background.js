const MODEL = "gemini-2.5-flash";

chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});

const PROMPT = `
You are a manga page translator and visual text detector.
Look ONLY at the manga/comic artwork visible in this screenshot. Ignore browser controls, website navigation, buttons, watermarks, comments, and page UI.
Find readable English dialogue and narration inside speech balloons or narration boxes.
For each found balloon or narration box:
- Translate its English text into natural, concise Indonesian.
- Preserve character names, meaning, tone, punctuation, and speaker intent.
- Do not invent missing words.
- Do not translate sound effects, logos, credits, or ordinary website text.
- Return a bounding box around the INSIDE area of the speech balloon or narration box, leaving a small margin so the balloon outline remains visible.
Coordinates must be normalized from 0 to 1000 relative to the FULL screenshot: x is left, y is top, w is width, h is height.
Return ONLY valid JSON in this exact shape:
{"bubbles":[{"x":100,"y":120,"w":220,"h":90,"text":"Terjemahan bahasa Indonesia"}]}
If no readable English manga dialogue/narration is visible, return {"bubbles":[]}.
Do not include markdown fences or commentary.
`;

function extractText(response) {
  return (response?.candidates?.[0]?.content?.parts || [])
    .map(part => part.text || "")
    .join("")
    .trim();
}

function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Gemini tidak mengembalikan JSON yang bisa dibaca.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function cleanBubbles(data) {
  const source = Array.isArray(data?.bubbles) ? data.bubbles : [];
  return source.slice(0, 30).map(item => {
    const n = key => Math.max(0, Math.min(1000, Number(item[key]) || 0));
    const x = n("x"), y = n("y"), w = n("w"), h = n("h");
    const text = String(item.text || "").trim().slice(0, 500);
    return { x, y, w, h, text };
  }).filter(b => b.text && b.w >= 2 && b.h >= 2 && b.x + b.w <= 1010 && b.y + b.h <= 1010);
}

async function translateScreenshot(tab) {
  if (!tab?.id || typeof tab.windowId !== "number") {
    throw new Error("Tab aktif tidak ditemukan.");
  }

  const activeTabs = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (!activeTabs[0] || activeTabs[0].id !== tab.id) {
    throw new Error("Tab manga harus tetap aktif saat proses terjemahan berjalan.");
  }

  const saved = await chrome.storage.local.get(["apiKey"]);
  const apiKey = (saved.apiKey || "").trim();
  if (!apiKey) throw new Error("Gemini API key belum disimpan di extension.");

  const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "jpeg",
    quality: 82
  });
  const match = screenshot.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Gagal mengambil gambar layar.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: match[1], data: match[2] } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          maxOutputTokens: 4096
        }
      })
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.error?.message || `Gemini API error (${response.status}).`;
    throw new Error(message);
  }

  const text = extractText(result);
  if (!text) throw new Error("Gemini tidak memberi hasil. Coba ulangi atau gunakan model lain.");
  const parsed = parseJson(text);
  return cleanBubbles(parsed);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "TRANSLATE_VIEW") return;

  translateScreenshot(sender.tab)
    .then(bubbles => sendResponse({ ok: true, bubbles }))
    .catch(error => sendResponse({ ok: false, error: error.message || "Terjadi kesalahan." }));

  return true;
});
