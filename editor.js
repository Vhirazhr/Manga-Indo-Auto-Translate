(() => {
  if (globalThis.MangaIndoEditor) return;

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
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = [
      ":host{all:initial}",
      ".backdrop{position:fixed;inset:0;background:rgba(8,10,16,.88);display:flex;flex-direction:column;color:#f8fafc;font:13px Arial,sans-serif;pointer-events:auto}",
      ".top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:#151922;border-bottom:1px solid #303744}",
      ".top strong{margin-right:auto;font-size:14px}",
      "button,input,select{font:inherit}",
      "button{border:1px solid #465164;background:#222b38;color:#f8fafc;border-radius:7px;padding:7px 10px;cursor:pointer}",
      "button.active{background:#2563eb;border-color:#60a5fa}",
      "button.primary{background:#16794a;border-color:#269a65}",
      "input[type=text]{min-width:150px;max-width:220px;padding:7px 8px;border-radius:6px;border:1px solid #465164;background:#0e131b;color:#fff}",
      "input[type=number]{width:58px;padding:6px;border-radius:6px;border:1px solid #465164;background:#0e131b;color:#fff}",
      "input[type=color]{width:34px;height:30px;padding:0;border:0;background:transparent}",
      ".stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:auto;padding:12px}",
      "canvas{display:block;max-width:100%;max-height:100%;object-fit:contain;background:#fff;box-shadow:0 5px 28px rgba(0,0,0,.4);touch-action:none}",
      ".hint{padding:7px 12px;background:#151922;color:#b9c3d2;font-size:11px}"
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
      Object.keys(modeButtons).forEach(key => {
        modeButtons[key].classList.toggle("active", key === next);
      });
    }

    ["text", "brush", "erase"].forEach(key => {
      const label = key === "text" ? "Teks" : key === "brush" ? "Kuas" : "Hapus";
      const button = makeButton(label, key === "text" ? "active" : "", () => setMode(key));
      modeButtons[key] = button;
      top.appendChild(button);
    });

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.placeholder = "Tulis teks lalu klik gambar";
    textInput.setAttribute("aria-label", "Teks yang akan ditambahkan");
    top.appendChild(textInput);

    const sizeLabel = document.createElement("span");
    sizeLabel.textContent = "Ukuran";
    top.appendChild(sizeLabel);

    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = "8";
    sizeInput.max = "180";
    sizeInput.value = "28";
    top.appendChild(sizeInput);

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = "#111111";
    colorInput.title = "Warna teks/kuas";
    top.appendChild(colorInput);

    const undoButton = makeButton("Undo", "", () => undo());
    top.appendChild(undoButton);

    const downloadButton = makeButton("Download PNG", "", () => {
      const dataUrl = canvas.toDataURL("image/png");
      onDownload(dataUrl);
    });
    top.appendChild(downloadButton);

    const saveButton = makeButton("Simpan ke halaman", "primary", () => {
      onSave(canvas.toDataURL("image/png"));
      close();
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
    hint.textContent = "Teks: isi kolom lalu klik gambar. Kuas: gambar bebas. Hapus: sapu area yang ingin diputihkan. Perubahan hanya disimpan jika kamu menekan Simpan.";
    backdrop.append(top, stage, hint);
    shadow.append(style, backdrop);
    document.documentElement.appendChild(host);

    let undoSnapshot = null;
    let drawing = false;
    let lastPoint = null;

    function close() {
      host.remove();
    }

    function remember() {
      try {
        undoSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch (_) {
        undoSnapshot = null;
      }
    }

    function undo() {
      if (!undoSnapshot) return;
      ctx.putImageData(undoSnapshot, 0, 0);
      undoSnapshot = null;
    }

    function getPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height
      };
    }

    function drawText(point) {
      const text = textInput.value.trim();
      if (!text) return;
      remember();
      const size = Math.max(8, Math.min(180, Number(sizeInput.value) || 28));
      ctx.save();
      ctx.font = "bold " + size + "px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      const lines = text.split("\n");
      const lineHeight = size * 1.2;
      const startY = point.y - ((lines.length - 1) * lineHeight) / 2;
      for (let i = 0; i < lines.length; i += 1) {
        ctx.lineWidth = Math.max(1, size * 0.07);
        ctx.strokeStyle = "#ffffff";
        ctx.strokeText(lines[i], point.x, startY + i * lineHeight);
        ctx.fillStyle = colorInput.value;
        ctx.fillText(lines[i], point.x, startY + i * lineHeight);
      }
      ctx.restore();
    }

    canvas.addEventListener("pointerdown", event => {
      event.preventDefault();
      const point = getPoint(event);
      if (mode === "text") {
        drawText(point);
        return;
      }

      remember();
      drawing = true;
      lastPoint = point;
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", event => {
      if (!drawing || !lastPoint) return;
      const point = getPoint(event);
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, Math.min(100, Number(sizeInput.value) || 28));
      ctx.strokeStyle = mode === "erase" ? "#ffffff" : colorInput.value;
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.restore();
      lastPoint = point;
    });

    function endDrawing() {
      drawing = false;
      lastPoint = null;
    }
    canvas.addEventListener("pointerup", endDrawing);
    canvas.addEventListener("pointercancel", endDrawing);
    canvas.addEventListener("lostpointercapture", endDrawing);

    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0);
    };
    image.onerror = () => {
      hint.textContent = "Gagal membuka gambar untuk diedit.";
    };
    image.src = imageUrl;

    return { close };
  }

  globalThis.MangaIndoEditor = { open };
})();