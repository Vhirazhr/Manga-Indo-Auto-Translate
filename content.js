(() => {
  if (window.__MANGA_INDO_AUTO_TRANSLATE_V2__) return;
  window.__MANGA_INDO_AUTO_TRANSLATE_V2__ = true;
  window.__MANGA_INDO_AUTO_TRANSLATE_V1__ = true;

  let autoEnabled = false;
  let timer = null;
  let toastTimer = null;
  let inFlight = false;
  let rerunRequested = false;
  let host = null;
  let shadow = null;
  let overlayRoot = null;

  function ensureOverlay() {
    if (host?.isConnected) return;

    host = document.createElement("div");
    host.id = "manga-indo-auto-translate-host";
    host.style.cssText = [
      "position:fixed",
      "inset:0",
      "width:100vw",
      "height:100vh",
      "z-index:2147483647",
      "pointer-events:none"
    ].join(";");

    shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .root {
        position: fixed; inset: 0; width: 100vw; height: 100vh;
        pointer-events: none; overflow: hidden;
      }
      .bubble {
        position: absolute; box-sizing: border-box; display: flex;
        align-items: center; justify-content: center;
        padding: 2px 5px; overflow: hidden; text-align: center;
        white-space: pre-wrap; overflow-wrap: anywhere; word-break: normal;
        color: #111 !important; background: rgba(255,255,255,.97) !important;
        border: 1px solid rgba(0,0,0,.12); border-radius: 10px;
        font-family: Arial, "Noto Sans", sans-serif;
        font-weight: 700; line-height: 1.12; text-shadow: none;
        box-shadow: 0 1px 3px rgba(0,0,0,.16);
      }
      .toast {
        position: absolute; top: 14px; right: 14px; max-width: min(360px, calc(100vw - 28px));
        box-sizing: border-box; padding: 9px 12px; border-radius: 9px;
        color: #fff; background: rgba(25, 25, 28, .92);
        font: 12px/1.45 Arial, sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,.2);
        overflow-wrap: anywhere;
      }
      .toast.error { background: rgba(150, 35, 35, .96); }
      .toast.success { background: rgba(25, 105, 65, .96); }
      .toast.warning { background: rgba(130, 82, 20, .96); }
    `;

    overlayRoot = document.createElement("div");
    overlayRoot.className = "root";
    shadow.append(style, overlayRoot);
    document.documentElement.appendChild(host);
  }

  function hideOverlay() {
    if (host) host.style.display = "none";
  }

  function clearOverlay() {
    if (overlayRoot) overlayRoot.replaceChildren();
    clearTimeout(toastTimer);
    hideOverlay();
  }

  function showToast(message, kind = "info", duration = 2800) {
    ensureOverlay();

    let toast = overlayRoot.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      overlayRoot.appendChild(toast);
    }

    toast.className = "toast" + (kind ? " " + kind : "");
    toast.textContent = String(message || "");
    host.style.display = "block";

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast?.remove();
      if (!overlayRoot?.querySelector(".bubble")) hideOverlay();
    }, duration);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getFontSize(text, width, height) {
    const characters = Array.from(text).length;
    const estimatedCharsPerLine = Math.max(5, Math.floor(width / 8));
    const estimatedLines = Math.max(1, Math.ceil(characters / estimatedCharsPerLine));
    const byHeight = height / (estimatedLines * 1.35);
    const byWidth = width / Math.max(7, Math.min(characters, 24) * 0.58);
    return clamp(Math.min(24, byHeight, byWidth), 9, 24);
  }

  function renderBubbles(bubbles) {
    ensureOverlay();
    overlayRoot.replaceChildren();

    for (const item of (bubbles || [])) {
      const x = clamp(Number(item.x) || 0, 0, 999);
      const y = clamp(Number(item.y) || 0, 0, 999);
      const w = clamp(Number(item.w) || 0, 0, 1000 - x);
      const h = clamp(Number(item.h) || 0, 0, 1000 - y);
      const text = String(item.text || "").trim();

      if (!text || w < 2 || h < 2) continue;

      const el = document.createElement("div");
      el.className = "bubble";
      el.textContent = text;
      el.style.left = (x / 10) + "%";
      el.style.top = (y / 10) + "%";
      el.style.width = (w / 10) + "%";
      el.style.height = (h / 10) + "%";

      const pixelWidth = (w / 1000) * window.innerWidth;
      const pixelHeight = (h / 1000) * window.innerHeight;
      el.style.fontSize = getFontSize(text, pixelWidth, pixelHeight) + "px";
      overlayRoot.appendChild(el);
    }

    host.style.display = overlayRoot.childElementCount ? "block" : "none";
  }

  async function translateNow() {
    if (inFlight) {
      rerunRequested = true;
      return;
    }

    inFlight = true;
    hideOverlay();

    try {
      // Let the browser remove the overlay before capturing the manga viewport.
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await chrome.runtime.sendMessage({ type: "TRANSLATE_VIEW" });
      if (!response?.ok) {
        showToast(response?.error || "Terjemahan gagal. Coba lagi.", "error", 4200);
        return;
      }

      const bubbles = Array.isArray(response.bubbles) ? response.bubbles : [];
      renderBubbles(bubbles);

      if (bubbles.length) {
        showToast("Selesai. " + bubbles.length + " area dialog diterjemahkan.", "success");
      } else {
        showToast("Tidak ada dialog yang terbaca pada layar ini.", "warning");
      }
    } catch (error) {
      showToast(error?.message || "Terjadi kesalahan saat menerjemahkan.", "error", 4200);
    } finally {
      inFlight = false;

      if (rerunRequested && autoEnabled) {
        rerunRequested = false;
        scheduleTranslation();
      } else {
        rerunRequested = false;
      }
    }
  }

  function scheduleTranslation() {
    if (!autoEnabled) return;

    hideOverlay();
    clearTimeout(timer);

    if (inFlight) {
      rerunRequested = true;
      return;
    }

    timer = setTimeout(() => {
      translateNow();
    }, 1100);
  }

  function onScrollOrResize() {
    scheduleTranslation();
  }

  // Capture scroll events from nested manga reader containers as well as the page.
  document.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
  window.addEventListener("resize", onScrollOrResize, { passive: true });

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "START") {
      autoEnabled = Boolean(message.auto);
      clearTimeout(timer);
      rerunRequested = false;
      translateNow();
    } else if (message?.type === "SET_AUTO") {
      autoEnabled = Boolean(message.enabled);
      if (autoEnabled) {
        scheduleTranslation();
      } else {
        clearTimeout(timer);
        rerunRequested = false;
      }
    } else if (message?.type === "TRANSLATE_NOW") {
      translateNow();
    } else if (message?.type === "STOP") {
      autoEnabled = false;
      clearTimeout(timer);
      rerunRequested = false;
      clearOverlay();
    }
  });
})();
