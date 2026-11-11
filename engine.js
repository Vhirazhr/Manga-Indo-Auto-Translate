import { checkEngine, translateLocal } from "./local-engine.mjs";

const jobs = new Map();
let tail = Promise.resolve();
const TIMEOUT = 20 * 60 * 1000;

function friendlyError(error) {
  if (error.name === "TimeoutError" || error.name === "AbortError") return "Mesin lokal melewati batas 20 menit. Periksa unduhan model atau gunakan gambar lebih kecil.";
  if (error instanceof TypeError) return "Mesin lokal tidak dapat dihubungi. Jalankan start-engine.ps1 dan tunggu server di port 8000 siap.";
  return error.message || "Proses mesin lokal gagal.";
}

function startJob(message) {
  for (const [id, job] of jobs) if (job.done && Date.now() - job.finished > 60000) jobs.delete(id);
  if (jobs.size >= 8) throw new Error("Antrean mesin penuh. Tunggu halaman sebelumnya selesai.");
  const jobId = crypto.randomUUID();
  const job = { owner: message.owner, done: false, progress: "Menunggu antrean mesin lokal..." };
  jobs.set(jobId, job);
  tail = tail.then(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      job.progress = "Memuat model lokal; pemakaian pertama mengunduh model...";
      const dataUrl = await translateLocal(message.payload, message.targetLanguage, (code, status) => {
        job.progress = code === 3 ? "Menunggu antrean: " + status : code === 4
          ? "Menyiapkan worker lokal..."
          : "Mesin lokal: " + status;
      }, controller.signal);
      job.result = { ok: true, dataUrl };
    } catch (error) {
      job.result = { ok: false, error: friendlyError(error) };
    } finally {
      clearTimeout(timeout);
      job.done = true;
      job.finished = Date.now();
      setTimeout(() => jobs.delete(jobId), 60000);
    }
  });
  return { ok: true, jobId };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "mita-engine" || sender.id !== chrome.runtime.id) return;
  if (message.type === "CHECK_ENGINE") {
    checkEngine().then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: friendlyError(error) }));
    return true;
  }
  try {
    if (message.type === "START_JOB") sendResponse(startJob(message));
    else {
      const job = jobs.get(message.jobId);
      if (!job || job.owner !== message.owner) throw new Error("Pekerjaan tidak ditemukan atau sudah kedaluwarsa. Coba terjemahkan ulang.");
      if (message.type === "RELEASE_JOB") {
        if (job.done) jobs.delete(message.jobId);
        sendResponse({ ok: true });
      } else if (message.type === "GET_JOB") {
        sendResponse({ ok: true, done: job.done, progress: job.progress, result: job.done ? job.result : undefined });
      }
    }
  } catch (error) { sendResponse({ ok: false, error: error.message }); }
});
