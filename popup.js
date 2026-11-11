const apiKeyInput = document.getElementById("apiKey");
const targetLanguage = document.getElementById("targetLanguage");
const sourceLanguage = document.getElementById("sourceLanguage");
const aiCleanup = document.getElementById("aiCleanup");
const siteAuto = document.getElementById("siteAuto");
const statusBox = document.getElementById("status");
const siteName = document.getElementById("siteName");

let activeTab = null;
let activeHost = "";
let detectedOrigins = [];

function setStatus(text, kind) {
  statusBox.textContent = text;
  statusBox.className = kind || "";
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendToPage(message) {
  const tab = activeTab || await getActiveTab();
  if (!tab?.id) throw new Error("Tab aktif tidak ditemukan.");
  await chrome.tabs.sendMessage(tab.id, message);
}

async function savePreferences() {
  await chrome.storage.local.set({
    targetLanguage: targetLanguage.value,
    sourceLanguage: sourceLanguage.value,
    cleanupMode: aiCleanup.checked ? "ai" : "simple"
  });
  try { await sendToPage({ type: "PREFERENCES_CHANGED" }); } catch (_) {}
}

async function loadPopup() {
  activeTab = await getActiveTab();
  if (activeTab?.url && /^https?:/i.test(activeTab.url)) {
    const url = new URL(activeTab.url);
    activeHost = url.hostname;
    siteName.textContent = "Situs aktif: " + activeHost;
    try {
      const scan = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          const origins = new Set();
          try { origins.add(location.origin); } catch (_) {}
          document.querySelectorAll("img").forEach(img => {
            try {
              const imageUrl = new URL(img.currentSrc || img.src, location.href);
              if (imageUrl.protocol === "http:" || imageUrl.protocol === "https:") origins.add(imageUrl.origin);
            } catch (_) {}
          });
          return Array.from(origins).slice(0, 12);
        }
      });
      detectedOrigins = scan?.[0]?.result || [url.origin];
    } catch (_) {
      detectedOrigins = [url.origin];
    }
  } else {
    siteName.textContent = "Buka situs manga terlebih dahulu.";
  }

  const saved = await chrome.storage.local.get([
    "apiKey", "targetLanguage", "sourceLanguage", "cleanupMode", "autoSites"
  ]);

  targetLanguage.value = saved.targetLanguage || "id";
  sourceLanguage.value = saved.sourceLanguage || "auto";
  aiCleanup.checked = (saved.cleanupMode || "ai") === "ai";
  siteAuto.checked = Boolean(saved.autoSites?.[activeHost]);

  if (saved.apiKey) {
    setStatus("API key sudah tersimpan. Isi kolom hanya jika ingin mengganti.", "success");
  } else {
    setStatus("Masukkan API key Gemini terlebih dahulu.");
  }
}

document.addEventListener("DOMContentLoaded", loadPopup);

document.getElementById("saveKey").addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setStatus("Kolom API key masih kosong.", "error");
    return;
  }
  await chrome.storage.local.set({ apiKey: key });
  apiKeyInput.value = "";
  setStatus("API key berhasil disimpan di penyimpanan lokal Chrome.", "success");
});

document.getElementById("clearKey").addEventListener("click", async () => {
  await chrome.storage.local.remove("apiKey");
  apiKeyInput.value = "";
  setStatus("API key dihapus dari extension.", "success");
});

[targetLanguage, sourceLanguage, aiCleanup].forEach(control => {
  control.addEventListener("change", () => {
    savePreferences().then(() => setStatus("Pengaturan tersimpan.", "success"));
  });
});

document.getElementById("grantAccess").addEventListener("click", async () => {
  try {
    if (!activeTab?.id || !detectedOrigins.length) {
      setStatus("Buka tab manga lalu buka kembali popup extension.", "error");
      return;
    }

    // Request optional host permissions as the first asynchronous action in this click handler.
    const origins = detectedOrigins.map(origin => origin + "/*");
    const granted = await chrome.permissions.request({ origins });

    if (!granted) {
      setStatus("Izin tidak diberikan. Extension belum bisa mengambil gambar dari situs ini.", "error");
      return;
    }

    setStatus("Izin berhasil diberikan untuk " + origins.length + " domain situs/gambar.", "success");
  } catch (error) {
    setStatus("Gagal meminta izin: " + (error?.message || "Unknown error"), "error");
  }
});

siteAuto.addEventListener("change", async () => {
  try {
    const saved = await chrome.storage.local.get(["autoSites"]);
    const sites = saved.autoSites || {};
    sites[activeHost] = siteAuto.checked;
    await chrome.storage.local.set({ autoSites: sites });
    setStatus(siteAuto.checked ? "Auto-translate aktif untuk situs ini." : "Auto-translate dimatikan.", "success");
  } catch (error) {
    setStatus("Pengaturan tersimpan. Refresh halaman manga jika content script belum aktif. " + (error?.message || ""), "error");
  }
});

document.getElementById("translateVisible").addEventListener("click", async () => {
  try {
    await savePreferences();
    const saved = await chrome.storage.local.get(["apiKey"]);
    if (!saved.apiKey) {
      setStatus("Simpan Gemini API key terlebih dahulu.", "error");
      return;
    }
    await sendToPage({ type: "TRANSLATE_VISIBLE" });
    setStatus("Permintaan dikirim. Lihat status di halaman manga.", "success");
  } catch (error) {
    setStatus("Tidak bisa mengirim perintah. Refresh halaman manga lalu coba lagi. " + (error?.message || ""), "error");
  }
});

document.getElementById("selectArea").addEventListener("click", async () => {
  try {
    await sendToPage({ type: "START_AREA_SELECTION" });
    setStatus("Tarik mouse pada halaman untuk memilih area.", "success");
  } catch (error) {
    setStatus("Refresh halaman manga lalu coba lagi. " + (error?.message || ""), "error");
  }
});

document.getElementById("toggleOriginal").addEventListener("click", async () => {
  try {
    await sendToPage({ type: "TOGGLE_ORIGINALS" });
    setStatus("Mode Original / Result diganti.", "success");
  } catch (error) {
    setStatus("Refresh halaman manga lalu coba lagi. " + (error?.message || ""), "error");
  }
});