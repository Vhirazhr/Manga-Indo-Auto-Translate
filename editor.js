(() => {
  if (globalThis.MangaIndoEditor) return;

  const HISTORY_LIMIT = 12;

  function makeButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener("click", handler);
    return button;
  }

  function open(options) {
    const imageUrl = options.imageUrl;
    const onSave = options.onSave || (() => {});
    const onDownload = options.onDownload || (() => {});

    const host = document.createElement("div");
    host.id = "manga-indo-image-editor-host";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = [
      ":host{all:initial}",
      ".backdrop{position:fixed;inset:0;background:rgba(8,10,16,.92);display:flex;flex-direction:column;color:#f8fafc;font:13px Arial,sans-serif;pointer-events:auto}",
      ".top{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:10px 12px;background:#151922;border-bottom:1px solid #303744;max-height:32vh;overflow:auto}",
      ".top strong{margin-right:auto;font-size:14px;white-space:nowrap}",
      ".group{display:flex;align-items:center;gap:5px;padding:3px 6px;border:1px solid #303b4d;border-radius:8px}",
      ".group label{font-size:11px;color:#c4ccda;white-space:nowrap}",
      "button,input,select,textarea{font:inherit}",
      "button{border:1px solid #465164;background:#222b38;color:#f8fafc;border-radius:7px;padding:7px 9px;cursor:pointer}",
      "button:hover{background:#34445b}",
      "button:disabled{opacity:.4;cursor:not-allowed}",
      "button.active{background:#2563eb;border-color:#60a5fa}",
      "button.primary{background:#16794a;border-color:#269a65}",
      "button.primary:hover{background:#198b55}",
      "input[type=text],textarea,select{padding:7px 8px;border-radius:6px;border:1px solid #465164;background:#0e131b;color:#fff;max-width:210px}",
      "textarea{width:180px;min-height:38px;resize:vertical;line-height:1.3}",
      "input[type=number]{width:58px;padding:6px;border-radius:6px;border:1px solid #465164;background:#0e131b;color:#fff}",
      "input[type=color]{width:32px;height:29px;padding:0;border:0;background:transparent;cursor:pointer}",
      "input[type=range]{width:75px}",
      ".stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:auto;padding:12px;background-color:#202632;background-image:linear-gradient(45deg,#2b3442 25%,transparent 25%),linear-gradient(-45deg,#2b3442 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2b3442 75%),linear-gradient(-45deg,transparent 75%,#2b3442 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}",
      "canvas{display:block;max-width:100%;max-height:100%;object-fit:contain;background:transparent;box-shadow:0 5px 28px rgba(0,0,0,.4);touch-action:none;cursor:crosshair}",
      ".hint{padding:7px 12px;background:#151922;color:#b9c3d2;font-size:11px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}",
      ".status{color:#9cc7ff}"
    ].join("\n");

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const top = document.createElement("div");
    top.className = "top";

    const heading = document.createElement("strong");
    heading.textContent = "Manga Indo Image Editor";
    top.appendChild(heading);

    const modeButtons = {};
    let mode = "text";
    function setMode(next) {
      mode = next;
      Object.keys(modeButtons).forEach(key => modeButtons[key].classList.toggle("active", key === next));
      hintStatus.textContent = next === "text"
        ? "Teks: isi kolom, lalu klik gambar untuk menempatkannya."
        : next === "brush"
          ? "Kuas: gambar bebas pada halaman."
          : "Penghapus: sapu bagian yang ingin dihapus menjadi transparan.";
    }

    [
      ["text", "Teks"],
      ["brush", "Kuas"],
      ["erase", "Penghapus"]
    ].forEach(([key, label]) => {
      const button = makeButton(label, key === "text" ? "active" : "", () => setMode(key));
      modeButtons[key] = button;
      top.appendChild(button);
    });

    const textInput = document.createElement("textarea");
    textInput.placeholder = "Tulis teks terjemahan...";
    textInput.setAttribute("aria-label", "Teks yang akan ditambahkan");
    top.appendChild(textInput);

    const fontSelect = document.createElement("select");
    fontSelect.setAttribute("aria-label", "Jenis huruf");
    [
      ["Arial, sans-serif", "Arial"],
      ["Trebuchet MS, sans-serif", "Trebuchet"],
      ["Georgia, serif", "Georgia"],
      ["sans-serif", "Sans-serif"],
      ["serif", "Serif"]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      fontSelect.appendChild(option);
    });
    top.appendChild(fontSelect);

    const boldButton = makeButton("Bold", "active", () => {
      boldButton.classList.toggle("active");
    });
    boldButton.title = "Tebal / normal";
    top.appendChild(boldButton);

    const alignment = document.createElement("select");
    alignment.setAttribute("aria-label", "Perataan teks");
    [["center","Tengah"],["left","Kiri"],["right","Kanan"]].forEach(([value,label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      alignment.appendChild(option);
    });
    top.appendChild(alignment);

    const sizeGroup = document.createElement("div");
    sizeGroup.className = "group";
    const sizeLabel = document.createElement("label");
    sizeLabel.textContent = "Ukuran";
    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = "8";
    sizeInput.max = "240";
    sizeInput.value = "28";
    sizeInput.setAttribute("aria-label", "Ukuran teks atau kuas");
    sizeGroup.append(sizeLabel, sizeInput);
    top.appendChild(sizeGroup);

    const colorGroup = document.createElement("div");
    colorGroup.className = "group";
    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Warna";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = "#111111";
    colorInput.title = "Warna teks dan kuas";
    colorGroup.append(colorLabel, colorInput);
    top.appendChild(colorGroup);

    const outlineGroup = document.createElement("div");
    outlineGroup.className = "group";
    const outlineLabel = document.createElement("label");
    outlineLabel.textContent = "Outline";
    const outlineColor = document.createElement("input");
    outlineColor.type = "color";
    outlineColor.value = "#ffffff";
    outlineColor.title = "Warna garis tepi teks";
    const outlineWidth = document.createElement("input");
    outlineWidth.type = "number";
    outlineWidth.min = "0";
    outlineWidth.max = "20";
    outlineWidth.value = "2";
    outlineWidth.title = "Ketebalan outline";
    outlineGroup.append(outlineLabel, outlineColor, outlineWidth);
    top.appendChild(outlineGroup);

    const opacityGroup = document.createElement("div");
    opacityGroup.className = "group";
    const opacityLabel = document.createElement("label");
    opacityLabel.textContent = "Opacity";
    const opacityInput = document.createElement("input");
    opacityInput.type = "range";
    opacityInput.min = "10";
    opacityInput.max = "100";
    opacityInput.value = "100";
    opacityInput.setAttribute("aria-label", "Opacity kuas");
    opacityGroup.append(opacityLabel, opacityInput);
    top.appendChild(opacityGroup);

    const undoButton = makeButton("Undo", "", () => undo());
    const redoButton = makeButton("Redo", "", () => redo());
    top.append(undoButton, redoButton);

    const downloadButton = makeButton("Download PNG", "", () => {
      try {
        onDownload(canvas.toDataURL("image/png"));
      } catch (error) {
        hintStatus.textContent = "Gagal membuat PNG: " + (error?.message || "kesalahan canvas");
      }
    });
    top.appendChild(downloadButton);

    const saveButton = makeButton("Simpan ke halaman", "primary", () => {
      try {
        onSave(canvas.toDataURL("image/png"));
        close();
      } catch (error) {
        hintStatus.textContent = "Gagal menyimpan: " + (error?.message || "kesalahan canvas");
      }
    });
    top.appendChild(saveButton);

    const closeButton = makeButton("Tutup", "", () => close());
    top.appendChild(closeButton);

    const stage = document.createElement("div");
    stage.className = "stage";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    stage.appendChild(canvas);

    const hint = document.createElement("div");
    hint.className = "hint";
    const hintStatus = document.createElement("span");
    hintStatus.className = "status";
    hintStatus.textContent = "Memuat gambar...";
    const hintKeys = document.createElement("span");
    hintKeys.textContent = "Ctrl+Z Undo · Ctrl+Shift+Z Redo · Esc Tutup";
    hint.append(hintStatus, hintKeys);

    backdrop.append(top, stage, hint);
    shadow.append(style, backdrop);
    document.documentElement.appendChild(host);

    let undoStack = [];
    let redoStack = [];
    let drawing = false;
    let lastPoint = null;
    let imageReady = false;
    let closed = false;

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeyDown, true);
      host.remove();
    }

    function snapshot() {
      return canvas.toDataURL("image/png");
    }

    function updateHistoryButtons() {
      undoButton.disabled = undoStack.length === 0;
      redoButton.disabled = redoStack.length === 0;
    }

    function remember() {
      if (!imageReady) return;
      undoStack.push(snapshot());
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack = [];
      updateHistoryButtons();
    }

    function restore(dataUrl) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve();
        };
        image.onerror = () => reject(new Error("Riwayat gambar tidak dapat dipulihkan."));
        image.src = dataUrl;
      });
    }

    async function undo() {
      if (!undoStack.length) return;
      try {
        redoStack.push(snapshot());
        await restore(undoStack.pop());
        updateHistoryButtons();
      } catch (error) {
        hintStatus.textContent = error.message;
      }
    }

    async function redo() {
      if (!redoStack.length) return;
      try {
        undoStack.push(snapshot());
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
        await restore(redoStack.pop());
        updateHistoryButtons();
      } catch (error) {
        hintStatus.textContent = error.message;
      }
    }

    function getPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height
      };
    }

    function wrapText(text, maxWidth, font) {
      const output = [];
      const paragraphs = String(text).replace(/\r/g, "").split("\n");
      for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) {
          output.push("");
          continue;
        }
        let line = "";
        for (const word of words) {
          const candidate = line ? line + " " + word : word;
          if (line && ctx.measureText(candidate).width > maxWidth) {
            output.push(line);
            line = word;
          } else {
            line = candidate;
          }
        }
        output.push(line);
      }
      return output;
    }

    function drawText(point) {
      const text = textInput.value.trim();
      if (!text) {
        hintStatus.textContent = "Isi teks terjemahan terlebih dahulu.";
        return;
      }
      remember();
      const size = Math.max(8, Math.min(240, Number(sizeInput.value) || 28));
      const weight = boldButton.classList.contains("active") ? "bold" : "normal";
      const family = fontSelect.value;
      ctx.save();
      ctx.font = weight + " " + size + "px " + family;
      ctx.textAlign = alignment.value;
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      const maxWidth = Math.max(size * 2, canvas.width * 0.72);
      const lines = wrapText(text, maxWidth, ctx.font);
      const lineHeight = size * 1.18;
      const startY = point.y - ((lines.length - 1) * lineHeight) / 2;
      const outline = Math.max(0, Math.min(20, Number(outlineWidth.value) || 0));
      const alignOffset = alignment.value === "left" ? 0
        : alignment.value === "right" ? 0 : 0;
      const x = point.x + alignOffset;
      for (let i = 0; i < lines.length; i += 1) {
        const y = startY + i * lineHeight;
        if (outline > 0) {
          ctx.lineWidth = outline * 2;
          ctx.strokeStyle = outlineColor.value;
          ctx.strokeText(lines[i], x, y, maxWidth);
        }
        ctx.fillStyle = colorInput.value;
        ctx.fillText(lines[i], x, y, maxWidth);
      }
      ctx.restore();
      hintStatus.textContent = "Teks ditambahkan. Gunakan Undo jika perlu membatalkan.";
    }

    function drawDot(point) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.1, Math.min(1, Number(opacityInput.value) / 100));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, Math.min(240, Number(sizeInput.value) || 28));
      if (mode === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = colorInput.value;
      }
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x + 0.01, point.y + 0.01);
      ctx.stroke();
      ctx.restore();
    }

    function drawLine(from, to) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.1, Math.min(1, Number(opacityInput.value) / 100));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, Math.min(240, Number(sizeInput.value) || 28));
      if (mode === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = colorInput.value;
      }
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    }

    canvas.addEventListener("pointerdown", event => {
      if (!imageReady) return;
      event.preventDefault();
      const point = getPoint(event);
      if (mode === "text") {
        drawText(point);
        return;
      }
      remember();
      drawing = true;
      lastPoint = point;
      drawDot(point);
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", event => {
      if (!drawing || !lastPoint) return;
      const point = getPoint(event);
      drawLine(lastPoint, point);
      lastPoint = point;
    });

    function endDrawing() {
      drawing = false;
      lastPoint = null;
    }
    canvas.addEventListener("pointerup", endDrawing);
    canvas.addEventListener("pointercancel", endDrawing);
    canvas.addEventListener("lostpointercapture", endDrawing);

    document.addEventListener("keydown", onKeyDown, true);

    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0);
      imageReady = true;
      hintStatus.textContent = image.naturalWidth + " × " + image.naturalHeight + " px · " + HISTORY_LIMIT + " langkah riwayat";
      updateHistoryButtons();
    };
    image.onerror = () => {
      hintStatus.textContent = "Gagal membuka gambar untuk diedit.";
    };
    image.src = imageUrl;

    return { close };
  }

  globalThis.MangaIndoEditor = { open };
})();
