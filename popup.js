const apiKeyInput = document.getElementById("apiKey");
const autoToggle = document.getElementById("autoToggle");
const statusBox = document.getElementById("status");

function setStatus(message) {
  statusBox.textContent = message;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

document.addEventListener("DOMContentLoaded", async () => {
  const saved = await chrome.storage.local.get(["apiKey", "autoTranslate"]);
  if (saved.apiKey) apiKeyInput.value = saved.apiKey;
  autoToggle.checked = Boolean(saved.autoTranslate);
});

document.getElementById("saveKey").addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setStatus("API key masih kosong.");
    return;
  }
  await chrome.storage.local.set({ apiKey: key });
  setStatus("API key tersimpan di profil Chrome ini.");
});

autoToggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ autoTranslate: autoToggle.checked });
  const tab = await getActiveTab();
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "SET_AUTO",
        enabled: autoToggle.checked
      });
    } catch (_) {
      // Content script belum aktif. Pengaturan akan dipakai saat tombol Mulai ditekan.
    }
  }
  setStatus(autoToggle.checked
    ? "Mode otomatis aktif. Klik Mulai untuk mengaktifkannya di tab ini."
    : "Mode otomatis dimatikan.");
});

document.getElementById("start").addEventListener("click", async () => {
  const saved = await chrome.storage.local.get(["apiKey"]);
  if (!saved.apiKey) {
    setStatus("Masukkan dan simpan Gemini API key terlebih dahulu.");
    return;
  }

  const tab = await getActiveTab();
  if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
    setStatus("Buka halaman manga biasa terlebih dahulu. Halaman chrome:// tidak didukung.");
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    await chrome.tabs.sendMessage(tab.id, {
      type: "START",
      auto: autoToggle.checked
    });
    setStatus("Sedang membaca teks pada layar dan menerjemahkannya...");
  } catch (error) {
    setStatus("Tidak bisa aktif di tab ini. Muat ulang halaman manga, lalu coba lagi. Detail: " + error.message);
  }
});

document.getElementById("stop").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "STOP" });
      setStatus("Terjemahan disembunyikan dan auto-scroll dimatikan.");
    } catch (_) {
      setStatus("Belum ada penerjemah yang aktif di tab ini.");
    }
  }
});
