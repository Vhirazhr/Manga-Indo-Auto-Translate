(() => {
  if (globalThis.__MANGA_INDO_RUNEMANGA_V2__) return;
  globalThis.__MANGA_INDO_RUNEMANGA_V2__ = true;

  const imageStates = new WeakMap();
  const stateList = new Set();
  const queue = [];
  let activeState = null;
  let autoEnabled = false;
  let processingQueue = false;
  let selectionMode = false;
  let selectionStart = null;
  let selectionBox = null;
  let areaResult = null;
  let uiHost = null;
  let uiRoot = null;
  let toolbar = null;
  let toastNode = null;
  let toastTimer = null;
  let scanTimer = null;

  const siteHost = location.hostname;
  const AUTO_KEY = "autoSites";

  function sendStatus(text, kind) {
    showToast(text, kind || "info");
  }

  function showToast(text, kind) {
    ensureUI();
    if (!toastNode) {
      toastNode = document.createElement("div");
      toastNode.className = "mita-toast";
      uiRoot.appendChild(toastNode);
    }
    toastNode.className = "mita-toast " + (kind || "");
    toastNode.textContent = String(text || "");
    toastNode.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toastNode) toastNode.style.display = "none";
    }, 4200);
  }

  function ensureUI() {
    if (uiHost && uiHost.isConnected) return;

    uiHost = document.createElement("div");
    uiHost.id = "manga-indo-ui-host";
    uiHost.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;";
    uiRoot = uiHost.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = [
      ":host{all:initial}",
      ".mita-toolbar{position:fixed;display:flex;gap:5px;align-items:center;padding:6px;background:rgba(18,23,32,.96);border:1px solid #465164;border-radius:11px;box-shadow:0 4px 18px rgba(0,0,0,.35);pointer-events:auto;font:12px Arial,sans-serif;z-index:3;white-space:nowrap}",
      ".mita-toolbar button{border:0;border-radius:7px;padding:7px 9px;background:#303b4d;color:#fff;font:600 12px Arial,sans-serif;cursor:pointer}",
      ".mita-toolbar button:hover{background:#465875}",
      ".mita-toolbar .mita-main{background:#2563eb;color:#fff;font-weight:800;min-width:31px}",
      ".mita-toolbar .mita-on{background:#147d50}",
      ".mita-toast{position:fixed;right:14px;top:14px;max-width:min(390px,calc(100vw - 28px));padding:10px 13px;border-radius:9px;background:rgba(23,29,39,.96);color:#fff;font:12px/1.45 Arial,sans-serif;box-shadow:0 3px 16px rgba(0,0,0,.3);pointer-events:none;z-index:8;display:none;overflow-wrap:anywhere}",
      ".mita-toast.error{background:#9f2828}.mita-toast.success{background:#176b45}.mita-toast.warning{background:#805415}",
      ".mita-select-layer{position:fixed;inset:0;z-index:10;pointer-events:auto;cursor:crosshair;background:rgba(20,35,60,.10)}",
      ".mita-select-box{position:fixed;border:2px dashed #36a3ff;background:rgba(45,135,255,.16);pointer-events:none}",
      ".mita-area-result{position:fixed;z-index:9;object-fit:fill;pointer-events:none;box-shadow:0 0 0 2px #2563eb}",
      ".mita-page-badge{position:fixed;z-index:2;pointer-events:none;border-radius:5px;background:rgba(22,101,52,.92);color:white;padding:3px 6px;font:11px Arial,sans-serif}"
    ].join("\n");

    uiRoot.appendChild(style);
    document.documentElement.appendChild(uiHost);
  }

  function isCandidateImage(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    if (img.closest("#manga-indo-ui-host")) return false;
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) return false;
    if (img.naturalWidth < 260 || img.naturalHeight < 220) return false;

    const rect = img.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 100) return false;
    const style = getComputedStyle(img);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;

    const ratio = img.naturalHeight / img.naturalWidth;
    return ratio > 0.45 || img.naturalHeight > 1200;
  }

  function makeState(img) {
    let state = imageStates.get(img);
    if (state) return state;

    const source = img.currentSrc || img.src;
    state = {
      img,
      originalSrc: source,
      originalSrcAttr: img.getAttribute("src"),
      originalSrcset: img.getAttribute("srcset"),
      originalSizes: img.getAttribute("sizes"),
      translatedDataUrl: "",
      showingTranslated: false,
      busy: false,
      status: "idle",
      observerSeen: false,
      restoringOriginal: false
    };

    imageStates.set(img, state);
    stateList.add(state);

    img.addEventListener("pointerenter", () => showToolbar(state));
    img.addEventListener("pointerleave", () => {
      setTimeout(() => {
        if (!toolbar || !toolbar.matches(":hover")) hideToolbar();
      }, 140);
    });

    img.addEventListener("load", () => {
      if (!state.showingTranslated && img.currentSrc && img.currentSrc !== state.originalSrc) {
        updateOriginalSource(state);
      }
      scanImages();
    });

    if (intersectionObserver) intersectionObserver.observe(img);
    return state;
  }

  function updateOriginalSource(state) {
    const img = state.img;
    if (state.showingTranslated) return;
    state.originalSrc = img.currentSrc || img.src;
    state.originalSrcAttr = img.getAttribute("src");
    state.originalSrcset = img.getAttribute("srcset");
    state.originalSizes = img.getAttribute("sizes");
    state.translatedDataUrl = "";
    state.status = "idle";
  }

  function ensureToolbar() {
    ensureUI();
    if (toolbar) return toolbar;

    toolbar = document.createElement("div");
    toolbar.className = "mita-toolbar";
    toolbar.addEventListener("pointerenter", () => {});
    toolbar.addEventListener("pointerleave", () => {
      setTimeout(() => {
        if (activeState && !activeState.img.matches(":hover")) hideToolbar();
      }, 160);
    });

    const translate = document.createElement("button");
    translate.className = "mita-main";
    translate.textContent = "R";
    translate.title = "Terjemahkan halaman ini";
    translate.addEventListener("click", () => {
      if (activeState) translateImage(activeState, "manual");
    });

    const auto = document.createElement("button");
    auto.textContent = "Auto";
    auto.title = "Aktif/nonaktifkan otomatis untuk situs ini";
    auto.addEventListener("click", toggleSiteAuto);

    const original = document.createElement("button");
    original.textContent = "Original";
    original.title = "Tekan dan tahan untuk melihat gambar asli";
    let originalPress = false;
    original.addEventListener("click", () => {
      if (!originalPress && activeState) toggleOriginal(activeState);
    });
    original.addEventListener("pointerdown", () => {
      originalPress = true;
      if (activeState && activeState.translatedDataUrl) showOriginal(activeState);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(name => {
      original.addEventListener(name, () => {
        if (activeState && activeState.translatedDataUrl) showTranslated(activeState);
        setTimeout(() => { originalPress = false; }, 0);
      });
    });

    const edit = document.createElement("button");
    edit.textContent = "Edit";
    edit.title = "Edit gambar";
    edit.addEventListener("click", () => {
      if (activeState) openEditor(activeState);
    });

    toolbar.append(translate, auto, original, edit);
    uiRoot.appendChild(toolbar);
    return toolbar;
  }

  function showToolbar(state) {
    if (!isCandidateImage(state.img)) return;
    activeState = state;
    ensureToolbar();
    toolbar.style.display = "flex";
    updateToolbarPosition();
    updateToolbarState();
  }

  function hideToolbar() {
    if (toolbar) toolbar.style.display = "none";
    activeState = null;
  }

  function updateToolbarState() {
    if (!toolbar) return;
    const buttons = toolbar.querySelectorAll("button");
    if (buttons[1]) {
      buttons[1].textContent = autoEnabled ? "Auto ON" : "Auto";
      buttons[1].classList.toggle("mita-on", autoEnabled);
    }
    if (buttons[2]) buttons[2].textContent = activeState?.showingTranslated ? "Original" : "Result";
    if (buttons[0]) {
      buttons[0].textContent = activeState?.busy ? "..." : "R";
      buttons[0].disabled = Boolean(activeState?.busy);
    }
  }

  function updateToolbarPosition() {
    if (!toolbar || !activeState || toolbar.style.display === "none") return;
    const rect = activeState.img.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) {
      hideToolbar();
      return;
    }

    const width = toolbar.offsetWidth || 230;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width - 6));
    const top = Math.max(8, Math.min(window.innerHeight - 46, rect.top + 8));
    toolbar.style.left = left + "px";
    toolbar.style.top = top + "px";
  }

  function siteSettings() {
    return chrome.storage.local.get([AUTO_KEY]).then(data => data[AUTO_KEY] || {});
  }

  async function loadSiteAuto() {
    const settings = await siteSettings();
    autoEnabled = Boolean(settings[siteHost]);
    updateToolbarState();
    if (autoEnabled) enqueueNearViewport();
  }

  async function setSiteAuto(enabled) {
    const settings = await siteSettings();
    settings[siteHost] = Boolean(enabled);
    await chrome.storage.local.set({ [AUTO_KEY]: settings });
    autoEnabled = Boolean(enabled);
    updateToolbarState();

    if (autoEnabled) {
      scanImages();
      enqueueNearViewport();
      showToast("Auto-translate aktif untuk " + siteHost + ".", "success");
    } else {
      queue.length = 0;
      showToast("Auto-translate dimatikan untuk " + siteHost + ".");
    }
  }

  async function toggleSiteAuto() {
    await setSiteAuto(!autoEnabled);
  }

  function imageDistance(state) {
    const rect = state.img.getBoundingClientRect();
    const center = window.innerHeight / 2;
    return Math.abs((rect.top + rect.bottom) / 2 - center);
  }

  function enqueue(state) {
    if (!autoEnabled || state.busy || ["done", "empty", "error", "queued"].includes(state.status)) return;
    state.status = "queued";
    queue.push(state);
    queue.sort((a, b) => imageDistance(a) - imageDistance(b));
    processQueue();
  }

  async function processQueue() {
    if (processingQueue || !autoEnabled) return;
    processingQueue = true;

    while (queue.length && autoEnabled) {
      queue.sort((a, b) => imageDistance(a) - imageDistance(b));
      const state = queue.shift();
      if (!state || state.status !== "queued") continue;
      await translateImage(state, "auto");
    }

    processingQueue = false;
  }

  function enqueueNearViewport() {
    const margin = 1000;
    for (const state of Array.from(stateList)) {
      if (!state.img.isConnected) {
        stateList.delete(state);
        if (intersectionObserver) intersectionObserver.unobserve(state.img);
        continue;
      }
      const rect = state.img.getBoundingClientRect();
      if (rect.bottom >= -margin && rect.top <= window.innerHeight + margin) enqueue(state);
    }
  }

  async function readBlobUrl(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function imageRequestSource(state) {
    const url = state.originalSrc;
    if (!url) throw new Error("Alamat gambar tidak ditemukan.");
    if (url.startsWith("data:")) return { imageDataUrl: url };
    if (url.startsWith("blob:")) return { imageDataUrl: await readBlobUrl(url) };
    return { imageUrl: url };
  }

  async function translateImage(state, source) {
    if (!state || state.busy || state.status === "done") return;
    state.busy = true;
    state.status = "processing";
    if (activeState === state) updateToolbarState();

    showToast(source === "auto" ? "Menerjemahkan halaman manga yang dekat dengan posisi bacamu..." : "Mengirim gambar ke Gemini untuk diterjemahkan...", "info", 6000);

    try {
      const imageSource = await imageRequestSource(state);
      const response = await chrome.runtime.sendMessage({
        type: "PROCESS_MANGA_IMAGE",
        ...imageSource
      });

      if (!response?.ok) throw new Error(response?.error || "Proses terjemahan gagal.");
      if (response.noText || !response.dataUrl) {
        state.status = "empty";
        showToast("Tidak ada dialog yang terbaca pada gambar ini.", "warning");
        return;
      }

      state.translatedDataUrl = response.dataUrl;
      state.status = "done";
      showTranslated(state);

      const warning = response.cleanupWarning ? " " + response.cleanupWarning : "";
      showToast("Halaman selesai diterjemahkan (" + response.regions.length + " area)." + warning, response.cleanupWarning ? "warning" : "success", 5200);
    } catch (error) {
      state.status = "error";
      showToast(error?.message || "Terjadi kesalahan saat menerjemahkan.", "error", 6500);
    } finally {
      state.busy = false;
      if (activeState === state) updateToolbarState();
    }
  }

  function showTranslated(state) {
    if (!state?.translatedDataUrl) return;
    const img = state.img;
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.src = state.translatedDataUrl;
    state.showingTranslated = true;
    if (activeState === state) updateToolbarState();
  }

  function showOriginal(state) {
    if (!state) return;
    const img = state.img;
    state.restoringOriginal = true;
    if (state.originalSrcAttr === null) img.removeAttribute("src");
    else img.setAttribute("src", state.originalSrcAttr);
    if (state.originalSrcset === null) img.removeAttribute("srcset");
    else img.setAttribute("srcset", state.originalSrcset);
    if (state.originalSizes === null) img.removeAttribute("sizes");
    else img.setAttribute("sizes", state.originalSizes);
    if (!state.originalSrcAttr && state.originalSrc) img.src = state.originalSrc;
    state.showingTranslated = false;
    setTimeout(() => { state.restoringOriginal = false; }, 0);
    if (activeState === state) updateToolbarState();
  }

  function toggleOriginal(state) {
    if (!state?.translatedDataUrl) {
      showToast("Terjemahkan halaman ini terlebih dahulu.", "warning");
      return;
    }
    if (state.showingTranslated) showOriginal(state);
    else showTranslated(state);
  }

  function toggleAllOriginals() {
    const translated = Array.from(stateList).filter(state => state.translatedDataUrl);
    if (!translated.length) {
      showToast("Belum ada halaman yang diterjemahkan.", "warning");
      return;
    }
    const shouldShowOriginal = translated.some(state => state.showingTranslated);
    translated.forEach(state => shouldShowOriginal ? showOriginal(state) : showTranslated(state));
    showToast(shouldShowOriginal ? "Menampilkan gambar asli." : "Menampilkan hasil terjemahan.");
  }

  async function openEditor(state) {
    if (!globalThis.MangaIndoEditor) {
      showToast("Editor belum siap. Muat ulang halaman lalu coba lagi.", "error");
      return;
    }

    try {
      let dataUrl = state.translatedDataUrl;
      if (!dataUrl) {
        const source = await imageRequestSource(state);
        const response = await chrome.runtime.sendMessage({ type: "GET_IMAGE_DATA", ...source });
        if (!response?.ok) throw new Error(response?.error || "Gagal membuka gambar.");
        dataUrl = response.dataUrl;
      }

      globalThis.MangaIndoEditor.open({
        imageUrl: dataUrl,
        onSave: data => {
          state.translatedDataUrl = data;
          state.status = "done";
          showTranslated(state);
          showToast("Edit gambar tersimpan pada halaman.", "success");
        },
        onDownload: data => {
          chrome.runtime.sendMessage({
            type: "DOWNLOAD_IMAGE",
            dataUrl: data,
            filename: "manga-indo-edited.png"
          }).then(result => {
            if (!result?.ok) showToast(result?.error || "Gagal mengunduh gambar.", "error");
          });
        }
      });
    } catch (error) {
      showToast(error?.message || "Editor gagal dibuka.", "error");
    }
  }

  function findStateForContext(srcUrl) {
    if (srcUrl) {
      for (const state of stateList) {
        if (state.originalSrc === srcUrl || state.img.currentSrc === srcUrl || state.img.src === srcUrl) return state;
      }
    }
    if (activeState) return activeState;

    if (srcUrl) {
      const exact = Array.from(document.querySelectorAll("img")).find(img =>
        img.currentSrc === srcUrl || img.src === srcUrl
      );
      if (exact && isCandidateImage(exact)) return makeState(exact);
    }
    const candidates = Array.from(document.querySelectorAll("img")).filter(isCandidateImage);
    if (!candidates.length) return null;
    const center = window.innerHeight / 2;
    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return Math.abs((ar.top + ar.bottom) / 2 - center) - Math.abs((br.top + br.bottom) / 2 - center);
    });
    return makeState(candidates[0]);
  }

  function startAreaSelection() {
    ensureUI();
    if (selectionMode) return;
    selectionMode = true;
    selectionStart = null;
    selectionBox = document.createElement("div");
    selectionBox.className = "mita-select-box";

    const layer = document.createElement("div");
    layer.className = "mita-select-layer";
    layer.appendChild(selectionBox);
    uiRoot.appendChild(layer);
    showToast("Tarik mouse untuk memilih area manga. Tekan Esc untuk batal.", "info", 8000);

    layer.addEventListener("pointerdown", event => {
      event.preventDefault();
      selectionStart = { x: event.clientX, y: event.clientY };
      updateSelectionBox(event.clientX, event.clientY);
      layer.setPointerCapture(event.pointerId);
    });

    layer.addEventListener("pointermove", event => {
      if (!selectionStart) return;
      updateSelectionBox(event.clientX, event.clientY);
    });

    layer.addEventListener("pointerup", async event => {
      if (!selectionStart) return;
      const start = selectionStart;
      const end = { x: event.clientX, y: event.clientY };
      const rect = {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y)
      };
      layer.remove();
      selectionMode = false;
      selectionStart = null;

      if (rect.width < 30 || rect.height < 30) {
        showToast("Area terlalu kecil. Pilih area yang lebih besar.", "warning");
        return;
      }
      await translateSelectedArea(rect);
    });
  }

  function updateSelectionBox(x, y) {
    if (!selectionStart || !selectionBox) return;
    const left = Math.min(selectionStart.x, x);
    const top = Math.min(selectionStart.y, y);
    const width = Math.abs(x - selectionStart.x);
    const height = Math.abs(y - selectionStart.y);
    selectionBox.style.left = left + "px";
    selectionBox.style.top = top + "px";
    selectionBox.style.width = width + "px";
    selectionBox.style.height = height + "px";
  }

  async function translateSelectedArea(rect) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let state = null;

    for (const candidate of stateList) {
      const bounds = candidate.img.getBoundingClientRect();
      if (centerX >= bounds.left && centerX <= bounds.right && centerY >= bounds.top && centerY <= bounds.bottom) {
        state = candidate;
        break;
      }
    }

    showToast("Menerjemahkan area yang kamu pilih...", "info", 6000);

    let response = null;
    let directError = null;

    if (state) {
      const bounds = state.img.getBoundingClientRect();
      const area = {
        x: Math.max(0, (rect.left - bounds.left) / bounds.width),
        y: Math.max(0, (rect.top - bounds.top) / bounds.height),
        width: Math.min(1, rect.width / bounds.width),
        height: Math.min(1, rect.height / bounds.height)
      };

      try {
        const source = await imageRequestSource(state);
        response = await chrome.runtime.sendMessage({
          type: "PROCESS_MANGA_IMAGE",
          ...source,
          area
        });
        if (!response?.ok) throw new Error(response?.error || "Gagal menerjemahkan area gambar.");
      } catch (error) {
        directError = error;
      }
    }

    // Fallback: capture only the user-selected visible screen rectangle.
    // This also supports readers that draw pages on a canvas or block image URLs.
    if (!response?.ok) {
      try {
        const captured = await chrome.runtime.sendMessage({
          type: "CAPTURE_SELECTED_AREA",
          rect,
          dpr: window.devicePixelRatio || 1
        });
        if (!captured?.ok) throw new Error(captured?.error || "Tidak bisa mengambil area layar.");
        response = await chrome.runtime.sendMessage({
          type: "PROCESS_MANGA_IMAGE",
          imageDataUrl: captured.dataUrl
        });
        if (!response?.ok) throw new Error(response?.error || "Gagal menerjemahkan screenshot area.");
      } catch (error) {
        const message = error?.message || directError?.message || "Terjemahan area gagal.";
        showToast(message, "error", 6500);
        return;
      }
    }

    if (response.noText || !response.dataUrl) {
      showToast("Tidak ada teks yang terbaca di area ini.", "warning");
      return;
    }

    if (areaResult) areaResult.remove();
    areaResult = document.createElement("img");
    areaResult.className = "mita-area-result";
    areaResult.src = response.dataUrl;
    areaResult.style.left = rect.left + "px";
    areaResult.style.top = rect.top + "px";
    areaResult.style.width = rect.width + "px";
    areaResult.style.height = rect.height + "px";
    uiRoot.appendChild(areaResult);
    showToast("Area berhasil diterjemahkan dan ditampilkan di atas halaman.", "success");
  }

  function cancelAreaSelection() {
    if (!selectionMode) return;
    selectionMode = false;
    selectionStart = null;
    const layer = uiRoot?.querySelector(".mita-select-layer");
    if (layer) layer.remove();
    showToast("Pemilihan area dibatalkan.");
  }

  function scanImages() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const images = document.querySelectorAll("img");
      images.forEach(img => {
        if (!isCandidateImage(img)) return;
        const state = makeState(img);
        if (!state.observerSeen && intersectionObserver) {
          intersectionObserver.observe(img);
          state.observerSeen = true;
        }
      });
      if (autoEnabled) enqueueNearViewport();
    }, 180);
  }

  const intersectionObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting || !autoEnabled) return;
          const state = imageStates.get(entry.target);
          if (state) enqueue(state);
        });
      }, { root: null, rootMargin: "900px 0px", threshold: 0.01 })
    : null;

  window.addEventListener("scroll", () => {
    updateToolbarPosition();
    if (areaResult) {
      areaResult.remove();
      areaResult = null;
    }
    if (autoEnabled) enqueueNearViewport();
  }, { passive: true, capture: true });

  window.addEventListener("resize", updateToolbarPosition, { passive: true });
  document.addEventListener("load", event => {
    if (event.target instanceof HTMLImageElement) scanImages();
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") cancelAreaSelection();
  }, true);

  const mutationObserver = new MutationObserver(mutations => {
    let needsScan = false;
    for (const mutation of mutations) {
      if (mutation.type === "childList") needsScan = true;
      if (mutation.type === "attributes" && mutation.target instanceof HTMLImageElement) {
        const state = imageStates.get(mutation.target);
        if (state && !state.showingTranslated && !state.restoringOriginal && mutation.attributeName === "src") {
          updateOriginalSource(state);
        }
        needsScan = true;
      }
    }
    if (needsScan) scanImages();
  });

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset"]
  });

  chrome.runtime.onMessage.addListener(message => {
    if (!message?.type) return;

    if (message.type === "SET_SITE_AUTO") {
      setSiteAuto(Boolean(message.enabled));
    } else if (message.type === "TRANSLATE_VISIBLE") {
      scanImages();
      const visible = Array.from(document.querySelectorAll("img"))
        .filter(isCandidateImage)
        .map(img => makeState(img))
        .filter(state => {
          const rect = state.img.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        });
      if (!visible.length) {
        showToast("Tidak menemukan gambar manga yang terlihat. Scroll ke halaman manga dahulu.", "warning");
        return;
      }
      (async () => {
        for (const state of visible) {
          if (state.status !== "done") await translateImage(state, "manual");
        }
      })();
    } else if (message.type === "START_AREA_SELECTION") {
      startAreaSelection();
    } else if (message.type === "TOGGLE_ORIGINALS") {
      toggleAllOriginals();
    } else if (message.type === "TOGGLE_SITE_AUTO") {
      toggleSiteAuto();
    } else if (message.type === "TRANSLATE_CONTEXT_IMAGE") {
      const state = findStateForContext(message.srcUrl);
      if (state) translateImage(state, "context");
      else showToast("Tidak menemukan gambar manga untuk diterjemahkan.", "warning");
    } else if (message.type === "EDIT_CONTEXT_IMAGE") {
      const state = findStateForContext(message.srcUrl);
      if (state) openEditor(state);
      else showToast("Tidak menemukan gambar untuk diedit.", "warning");
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes[AUTO_KEY]) {
      const next = changes[AUTO_KEY].newValue || {};
      const enabled = Boolean(next[siteHost]);
      if (enabled !== autoEnabled) {
        autoEnabled = enabled;
        updateToolbarState();
        if (autoEnabled) enqueueNearViewport();
        else queue.length = 0;
      }
    }

    if (changes.targetLanguage || changes.sourceLanguage || changes.cleanupMode) {
      for (const state of stateList) {
        if (state.showingTranslated) showOriginal(state);
        state.translatedDataUrl = "";
        state.status = "idle";
      }
      queue.length = 0;
      if (autoEnabled) enqueueNearViewport();
      showToast("Pengaturan bahasa/restorasi berubah. Halaman akan diterjemahkan ulang saat dibutuhkan.", "info");
    }
  });

  loadSiteAuto();
  scanImages();
})();