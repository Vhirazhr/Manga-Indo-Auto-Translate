const apiKeyInput = document.getElementById("apiKey");
const autoToggle = document.getElementById("autoToggle");
const statusBox = document.getElementById("status");

function setStatus(message, kind = "") {
  statusBox.textContent = message;
  statusBox.className = kind;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("Tab aktif tidak ditemukan.");
  await chrome.tabs.sendMessage(tab.id, message);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const saved = await chrome.storage.local.get(["apiKey", "autoTranslate"]);
    autoToggle.checked = Boolean(saved.autoTranslate);

    if (saved.apiKey) {
      setStatus("API key sudah tersimpan. Isi kolom hanya jika ingin mengganti key.", "success");
    } else {
      setStatus("Masukkan API key Gemini, simpan, lalu tekan Mulai.");
    }
  } catch {
    setStatus("Tidak dapat membaca pengaturan extension.", "error");
  }
});

document.getElementById("saveKey").addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();

  if (!key) {
    const saved = await chrome.storage.local.get(["apiKey"]);
    setStatus(
      saved.apiKey ? "API key lama tetap tersimpan. Isi kolom jika ingin menggantinya." : "API key masih kosong.",
      saved.apiKey ? "" : "error"
    );
    return;
  }

  try {
    await chrome.storage.local.set({ apiKey: key });
    apiKeyInput.value = "";
    setStatus("API key berhasil disimpan di profil Chrome ini.", "success");
  } catch {
    setStatus("Gagal menyimpan API key. Periksa penyimpanan Chrome.", "error");
  }
});

document.getElementById("clearKey").addEventListener("click", async () => {
  try {
    await chrome.storage.local.remove("apiKey");
    apiKeyInput.value = "";
    setStatus("API key tersimpan sudah dihapus dari extension.", "success");
  } catch {
    setStatus("Gagal menghapus API key.", "error");
  }
});

autoToggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ autoTranslate: autoToggle.checked });

  try {
    await sendToActiveTab({
      type: "SET_AUTO",
      enabled: autoToggle.checked
    });

    setStatus(
      autoToggle.checked ? "Mode otomatis aktif di tab ini." : "Mode otomatis dimatikan.",
      "success"
    );
  } catch {
    setStatus(
      autoToggle.checked
        ? "Pengaturan otomatis tersimpan. Tekan Mulai untuk mengaktifkannya di tab ini."
        : "Pengaturan otomatis dimatikan.",
      ""
    );
  }
});

document.getElementById("start").addEventListener("click", async () => {
  try {
    const saved = await chrome.storage.local.get(["apiKey"]);
    if (!saved.apiKey) {
      setStatus("Masukkan dan simpan Gemini API key terlebih dahulu.", "error");
      return;
    }

    const tab = await getActiveTab();
    if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
      setStatus("Buka halaman manga biasa terlebih dahulu. Halaman chrome:// tidak didukung.", "error");
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    await chrome.tabs.sendMessage(tab.id, {
      type: "START",
      auto: autoToggle.checked
    });

    setStatus("Permintaan terkirim. Tunggu hasil di atas halaman manga.", "success");
  } catch (error) {
    setStatus(
      "Tidak bisa memulai. Muat ulang halaman manga lalu coba lagi. " + (error?.message || ""),
      "error"
    );
  }
});

document.getElementById("stop").addEventListener("click", async () => {
  autoToggle.checked = false;
  await chrome.storage.local.set({ autoTranslate: false });

  try {
    await sendToActiveTab({ type: "STOP" });
    setStatus("Terjemahan disembunyikan dan auto-scroll dimatikan.", "success");
  } catch {
    setStatus("Pengaturan dimatikan. Belum ada penerjemah aktif di tab ini.", "");
  }
});
