const imageInput = document.querySelector("#imageInput");
const chooseBtn = document.querySelector("#chooseBtn");
const dropZone = document.querySelector("#dropZone");
const previewImage = document.querySelector("#previewImage");
const previewEmpty = document.querySelector("#previewEmpty");
const recognizeBtn = document.querySelector("#recognizeBtn");
const copyBtn = document.querySelector("#copyBtn");
const copyImageBtn = document.querySelector("#copyImageBtn");
const clearBtn = document.querySelector("#clearBtn");
const outputTargetInputs = document.querySelectorAll('input[name="outputTarget"]');
const resultOutput = document.querySelector("#resultOutput");
const statusText = document.querySelector("#statusText");
const fileName = document.querySelector("#fileName");

const metadata = document.querySelector("#latexMetadata");
const packagesOutput = document.querySelector("#packagesOutput");
const notesOutput = document.querySelector("#notesOutput");
const formulaPreview = document.querySelector("#formulaPreview");
const wordHint = document.querySelector("#wordHint");
const downloadDocxBtn = document.querySelector("#downloadDocxBtn");

let selectedFile = null;
let latexSource = "";
let wordSource = "";
let mathmlSource = "";
let wordSourceFor = "";
let previewTimer = null;
let wordRequestId = 0;
let hasMetadata = false;

function setStatus(message) {
  statusText.textContent = message;
}

function getOutputTarget() {
  const selected = [...outputTargetInputs].find((input) => input.checked);
  return selected ? selected.value : "latex";
}

function clearMetadata() {
  hasMetadata = false;
  metadata.hidden = true;
  packagesOutput.textContent = "";
  notesOutput.replaceChildren();
}

function showMetadata(data) {
  const packages = Array.isArray(data.packages) ? data.packages : [];
  const notes = Array.isArray(data.notes) ? data.notes : [];

  packagesOutput.textContent = packages.length
    ? packages.map((name) => `\\usepackage{${name}}`).join("\n")
    : "模型未提供宏包建议，请按公式内容核对。";

  notesOutput.replaceChildren();
  for (const note of notes) {
    const item = document.createElement("li");
    item.textContent = note;
    notesOutput.append(item);
  }

  hasMetadata = packages.length > 0 || notes.length > 0;
  updateMetadataVisibility();
}

function updateMetadataVisibility() {
  metadata.hidden = !hasMetadata || getOutputTarget() !== "latex";
}

function setSelectedFile(file, source = "file") {
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    setStatus("请选择图片文件");
    return;
  }

  selectedFile = file;
  fileName.textContent =
    source === "paste" ? `粘贴图片 ${new Date().toLocaleTimeString()}` : file.name;
  latexSource = "";
  wordSource = "";
  mathmlSource = "";
  wordSourceFor = "";
  clearMetadata();
  renderOutput();
  recognizeBtn.disabled = false;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    previewImage.src = reader.result;
    previewImage.hidden = false;
    previewEmpty.hidden = true;
    dropZone.scrollTop = 0;
    dropZone.scrollLeft = 0;
  });
  reader.readAsDataURL(file);

  if (source === "paste") {
    flashDropZone();
    setStatus("已粘贴图片，可以开始识别");
  } else {
    setStatus("图片已选择，可以开始识别");
  }
}

function getImageFromClipboard(event) {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  return imageItem ? imageItem.getAsFile() : null;
}

function flashDropZone() {
  dropZone.classList.add("is-pasted");
  window.setTimeout(() => dropZone.classList.remove("is-pasted"), 700);
}

async function recognizeImage() {
  if (!selectedFile) {
    setStatus("请先选择一张公式图片");
    return;
  }

  clearMetadata();
  const formData = new FormData();
  formData.append("formulaImage", selectedFile);

  recognizeBtn.disabled = true;
  setStatus("正在识别图片...");

  try {
    const response = await fetch("/api/recognize", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "识别失败");
    }

    latexSource = data.latex || "";
    wordSource = data.word || "";
    // 识别响应里只有线性文本，没有 MathML；这里不能把它标记为"已缓存"，
    // 否则切到 Word 时会走缓存、拿不到 MathML，复制就退化成纯文本。
    mathmlSource = "";
    wordSourceFor = "";
    showMetadata(data);
    renderOutput();
    setStatus("识别完成");
  } catch (error) {
    latexSource = "";
    wordSource = "";
    mathmlSource = "";
    wordSourceFor = "";
    clearMetadata();
    renderOutput();
    setStatus(error.message);
  } finally {
    recognizeBtn.disabled = false;
  }
}

function renderOutput() {
  const target = getOutputTarget();

  downloadDocxBtn.hidden = target !== "word";

  if (target === "word") {
    resultOutput.readOnly = true;
    resultOutput.value = wordSource;
    formulaPreview.hidden = true;
    wordHint.hidden = false;
    copyImageBtn.disabled = true;
    ensureWordSource();
  } else {
    resultOutput.readOnly = false;
    resultOutput.value = latexSource;
    formulaPreview.hidden = false;
    wordHint.hidden = true;
    copyImageBtn.disabled = false;
    renderPreview();
  }

  updateMetadataVisibility();
}

function schedulePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(renderPreview, 200);
}

function renderPreview() {
  const latex = latexSource.trim();

  if (!latex) {
    formulaPreview.replaceChildren();
    formulaPreview.dataset.empty = "true";
    formulaPreview.textContent = "识别后在这里预览渲染结果";
    return;
  }

  formulaPreview.dataset.empty = "false";

  if (!window.MathJax || typeof window.MathJax.tex2svg !== "function") {
    formulaPreview.textContent = "渲染引擎尚未加载";
    return;
  }

  try {
    const rendered = window.MathJax.tex2svg(latex, { display: true });

    // 去掉无障碍 MathML 副本，避免浏览器用原生 MathML 再渲染一份。
    rendered.querySelector("mjx-assistive-mml")?.remove();
    formulaPreview.replaceChildren(rendered);
  } catch (error) {
    formulaPreview.textContent = `渲染失败：${error.message || error}`;
  }
}

async function ensureWordSource() {
  if (!latexSource.trim()) {
    wordSource = "";
    mathmlSource = "";
    wordSourceFor = "";
    resultOutput.value = "";
    return;
  }

  if (wordSourceFor === latexSource) {
    resultOutput.value = wordSource;
    return;
  }

  const requestId = wordRequestId + 1;
  wordRequestId = requestId;

  try {
    const response = await fetch("/api/word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex: latexSource }),
    });
    const data = await response.json();

    if (requestId !== wordRequestId) {
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || "转换失败");
    }

    wordSource = data.word || "";
    mathmlSource = data.mathml || "";
    wordSourceFor = latexSource;

    if (getOutputTarget() === "word") {
      resultOutput.value = wordSource;
    }
  } catch (error) {
    if (requestId === wordRequestId) {
      setStatus(`Word 转换失败：${error.message || error}`);
    }
  }
}

function renderSvgToPng(svg, scale) {
  return new Promise((resolve, reject) => {
    // MathJax 的 SVG 用 viewBox 描述真实尺寸，直接量 DOM 会被容器裁剪，
    // 长公式导出后只剩可见的一截。这里按 viewBox + 字号换算。
    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    const fontSize = Number.parseFloat(window.getComputedStyle(svg).fontSize) || 16;
    const bounds = svg.getBoundingClientRect();
    const width = viewBox && viewBox.width ? (viewBox.width / 1000) * fontSize : bounds.width;
    const height = viewBox && viewBox.height ? (viewBox.height / 1000) * fontSize : bounds.height;
    const padding = 12;
    const clone = svg.cloneNode(true);
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.removeAttribute("style");

    const source = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(width * scale) + padding * 2);
      canvas.height = Math.max(1, Math.ceil(height * scale) + padding * 2);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, padding, padding, Math.ceil(width * scale), Math.ceil(height * scale));
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("canvas 导出失败"))),
        "image/png",
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG 载入失败"));
    };

    image.src = url;
  });
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function downloadDocx() {
  if (!latexSource.trim()) {
    setStatus("还没有可导出的公式");
    return;
  }

  downloadDocxBtn.disabled = true;
  setStatus("正在生成 Word 文档...");

  try {
    const response = await fetch("/api/docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex: latexSource }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "生成失败");
    }

    const blob = await response.blob();
    downloadBlob(blob, `formula-${Date.now()}.docx`);
    setStatus("Word 文档已下载，打开即为公式对象");
  } catch (error) {
    setStatus(`生成 Word 文档失败：${error.message || error}`);
  } finally {
    downloadDocxBtn.disabled = false;
  }
}

async function copyImage() {
  const svg = formulaPreview.querySelector("svg");

  if (!svg) {
    setStatus("还没有可复制的公式");
    return;
  }

  try {
    const png = await renderSvgToPng(svg, 3);

    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setStatus("图片已复制到剪贴板");
      return;
    }

    downloadBlob(png, `formula-${Date.now()}.png`);
    setStatus("当前浏览器不支持复制图片，已改为下载");
  } catch (error) {
    setStatus(`复制图片失败：${error.message || error}`);
  }
}

async function writeClipboardText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    resultOutput.focus();
    resultOutput.select();
    document.execCommand("copy");
  }
}

async function copyResult() {
  const target = getOutputTarget();

  if (target === "image") {
    await copyImage();
    return;
  }

  if (target === "word") {
    await copyWordFormula();
    return;
  }

  const text = latexSource.trim();

  if (!text) {
    setStatus("没有可复制的识别结果");
    return;
  }

  await writeClipboardText(text);
  flashCopyButton();
  setStatus("已复制 LaTeX");
}

async function copyWordFormula() {
  await ensureWordSource();

  if (!wordSource) {
    setStatus("还没有可复制的 Word 公式");
    return;
  }

  if (navigator.clipboard && window.ClipboardItem && mathmlSource) {
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${mathmlSource}</body></html>`;

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([wordSource], { type: "text/plain" }),
        }),
      ]);
      flashCopyButton();
      setStatus("已复制公式，粘进 Word 即为公式对象");
      return;
    } catch {
      // 富文本剪贴板不可用时退回线性文本。
    }
  }

  await writeClipboardText(wordSource);
  flashCopyButton();
  setStatus(
    mathmlSource
      ? "已复制线性文本（浏览器不支持富文本剪贴板）"
      : "已复制线性文本（MathML 生成失败，Word 里不会变成公式）",
  );
}

function flashCopyButton() {
  copyBtn.classList.add("is-copied");
  window.setTimeout(() => copyBtn.classList.remove("is-copied"), 200);
}

function clearAll() {
  selectedFile = null;
  imageInput.value = "";
  latexSource = "";
  wordSource = "";
  mathmlSource = "";
  wordSourceFor = "";
  clearMetadata();
  renderOutput();
  previewImage.src = "";
  previewImage.hidden = true;
  previewEmpty.hidden = false;
  fileName.textContent = "未选择图片";
  recognizeBtn.disabled = true;
  setStatus("准备就绪");
}

chooseBtn.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", () => setSelectedFile(imageInput.files[0]));
recognizeBtn.addEventListener("click", recognizeImage);
copyBtn.addEventListener("click", copyResult);
copyImageBtn.addEventListener("click", copyImage);
downloadDocxBtn.addEventListener("click", downloadDocx);
clearBtn.addEventListener("click", clearAll);

resultOutput.addEventListener("input", () => {
  if (getOutputTarget() === "word") {
    return;
  }

  latexSource = resultOutput.value;
  schedulePreview();
});

[...outputTargetInputs].forEach((input) => {
  input.addEventListener("change", () => {
    renderOutput();

    if (getOutputTarget() === "word") {
      setStatus("已切换到 Word 线性格式");
    } else if (getOutputTarget() === "image") {
      setStatus("已切换到图片输出");
    }
  });
});

window.addEventListener("paste", (event) => {
  const imageFile = getImageFromClipboard(event);

  if (!imageFile) {
    return;
  }

  event.preventDefault();
  setSelectedFile(imageFile, "paste");
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  setSelectedFile(event.dataTransfer.files[0]);
});

clearAll();

if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
  window.MathJax.startup.promise.then(renderPreview);
}
