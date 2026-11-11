// Adapter for zyddnys/manga-image-translator's public streaming protocol.
export const ENGINE_URL = "http://127.0.0.1:8000";
export const STREAM_PATH = "/translate/with-form/image/stream";
export const MAX_FRAME = 32 * 1024 * 1024;
const LANGUAGES = { id: "IND", en: "ENG", ja: "JPN", ko: "KOR", zh: "CHS", es: "ESP", fr: "FRA", pt: "PTB", de: "DEU", ru: "RUS", vi: "VIN", th: "THA", tr: "TRK", ar: "ARA" };

export function engineConfig(target = "id") {
  if (!LANGUAGES[target]) throw new Error("Bahasa tujuan tidak didukung.");
  return {
    translator: { translator: "m2m100", target_lang: LANGUAGES[target] },
    // Match upstream manga-image-translator defaults for high-resolution manga.
    // Auto direction lets the renderer preserve both horizontal webtoon text and
    // vertical Japanese dialogue instead of forcing every region horizontally.
    detector: { detector: "default", detection_size: 2048 },
    ocr: { ocr: "48px", ignore_bubble: 5 },
    inpainter: { inpainter: "lama_large", inpainting_size: 2048, inpainting_precision: "bf16" },
    render: { renderer: "default", alignment: "auto", direction: "auto", rtl: true },
    colorizer: { colorizer: "none" },
    upscale: { upscaler: "none" },
    kernel_size: 3,
    mask_dilation_offset: 30
  };
}

export function pngDataUrl(bytes) {
  const magic = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !magic.every((v, i) => bytes[i] === v)) throw new Error("Mesin tidak mengembalikan gambar PNG yang valid.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16) < 2 || view.getUint32(20) < 2) throw new Error("Mesin mengembalikan placeholder, bukan gambar hasil.");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return "data:image/png;base64," + btoa(binary);
}

// Frames: 1 byte code, 4 byte big-endian payload length, N bytes payload.
// Network chunks may split anywhere, including inside a frame header.
export async function readFrames(body, onProgress = () => {}) {
  if (!body) throw new Error("Respons mesin kosong.");
  const reader = body.getReader();
  let buffer = new Uint8Array(0);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const next = new Uint8Array(buffer.length + value.length);
      next.set(buffer); next.set(value, buffer.length); buffer = next;
      while (buffer.length >= 5) {
        const code = buffer[0];
        const length = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(1);
        if (length > MAX_FRAME) throw new Error("Hasil mesin terlalu besar (maksimum 32 MB).");
        if (code > 4) throw new Error("Protokol mesin lokal tidak cocok.");
        if (buffer.length < length + 5) break;
        const payload = buffer.slice(5, length + 5);
        buffer = buffer.slice(length + 5);
        if (code === 0) return pngDataUrl(payload);
        const message = new TextDecoder().decode(payload).slice(0, 1000);
        if (code === 2) throw new Error("Mesin lokal: " + (message || "proses gagal"));
        onProgress(code, message);
      }
    }
    throw new Error("Koneksi mesin terputus sebelum gambar selesai. Periksa terminal mesin lalu coba lagi.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function checkEngine(fetcher = fetch) {
  const response = await fetcher(ENGINE_URL + "/openapi.json", { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Server lokal merespons HTTP " + response.status);
  const schema = await response.json();
  if (!schema.paths?.[STREAM_PATH]?.post) throw new Error("Server di port 8000 bukan Manga Image Translator yang kompatibel.");
}

export async function translateLocal(payload, target, onProgress, signal, fetcher = fetch) {
  const binary = atob(payload.data);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: payload.mimeType }), "page.png");
  form.append("config", JSON.stringify(engineConfig(target)));
  const response = await fetcher(ENGINE_URL + STREAM_PATH, { method: "POST", body: form, signal });
  if (!response.ok) throw new Error("Mesin lokal HTTP " + response.status + ": " + (await response.text()).slice(0, 300));
  if (!(response.headers.get("content-type") || "").includes("application/octet-stream")) throw new Error("Format streaming mesin tidak cocok.");
  return readFrames(response.body, onProgress);
}
