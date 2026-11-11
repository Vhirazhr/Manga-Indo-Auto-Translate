(() => {
  if (window.__MANGA_INDO_AUTO_TRANSLATE_V1__) return;
  window.__MANGA_INDO_AUTO_TRANSLATE_V1__ = true;

  let autoEnabled = false;
  let timer = null;
  let inFlight = false;
  let rerunRequested = false;
  let host = null;
  let shadow = null;
  let overlayRoot = null;

  function ensureOverlay() {
    if (host?.isConnected) return;
    host = document.createElement("div");
    host.id = "manga-indo-auto-translate-host";
    host.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;";
    shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .root { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; overflow: hidden; }
      .bubble {
        position: absolute; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
        padding: 3px 6px; overflow: hidden; text-align: center; white-space: normal; overflow-wrap: anywhere;
        color: #111 !important; background: rgba(255,255,255,.97) !important;
        border: 1px solid rgba(0,0,0,.10); border-radius: 13px;
        font-family: "Comic Sans MS", "Trebuchet MS", Arial, sans-serif;
        font-weight: 700; line-height: 1.12; text-shadow: none; box-shadow: 0 0 2px rgba(0,0,0,.08);
      }
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
    hideOverlay();
  }

  function renderBubbles(bubbles) {
    ensureOverlay();
    overlayRoot.replaceChildren();

    for (const item of (bubbles || [])) {
      const x = Math.max(0, Math.min(1000, Number(item.x) || 0));
      const y = Math.max(0, Math.min(1000, Number(item.y) || 0));
      const w = Math.max(0, Math.min(1000 - x, Number(item.w) || 0));
      const h = Math.max(0, Math.min(1000 - y, Number(item.h) || 0));
      const text = String(item.text || "").trim();
      if (!text || w < 2 || h < 2) continue;

      const el = document.createElement("div");
      el.className = "bubble";
      el.textContent = text;
      el.style.left = `${x / 10}%`;
      el.style.top = `${y / 10}%`;
      el.style.width = `${w / 10}%`;
      el.style.height = `${h / 10}%`;

      const pixelHeight = (h / 1000) * window.innerHeight;
      const fontSize = Math.max(10, Math.min(25, pixelHeight * 0.19));
      el.style.fontSize = `${fontSize}px`;
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
      // Give the browser a moment to remove our overlay before taking the screenshot.
      await new Promise(resolve => setTimeout(resolve, 90));
      const response = await chrome.runtime.sendMessage({ type: "TRANSLATE_VIEW" });
      if (!response?.ok) {
        console.warn("[Manga Indo] " + (response?.error || "Translation failed"));
        return;
      }
      renderBubbles(response.bubbles || []);
    } catch (error) {
      console.warn("[Manga Indo] " + error.message);
    } finally {
      inFlight = false;
      if (rerunRequested && autoEnabled) {
        rerunRequested = false;
        scheduleTranslation();
      }
    }
  }

  function scheduleTranslation() {
    if (!autoEnabled) return;
    hideOverlay();
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (inFlight) {
        rerunRequested = true;
      } else {
        translateNow();
      }
    }, 950);
  }

  function onScrollOrResize() {
    scheduleTranslation();
  }

  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize, { passive: true });

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "START") {
      autoEnabled = Boolean(message.auto);
      clearTimeout(timer);
      translateNow();
    } else if (message?.type === "SET_AUTO") {
      autoEnabled = Boolean(message.enabled);
      if (autoEnabled) scheduleTranslation();
      else {
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
