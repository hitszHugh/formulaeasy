const imageInput = document.querySelector("#imageInput");
const chooseBtn = document.querySelector("#chooseBtn");
const dropZone = document.querySelector("#dropZone");
const previewImage = document.querySelector("#previewImage");
const previewEmpty = document.querySelector("#previewEmpty");
const recognizeBtn = document.querySelector("#recognizeBtn");
const copyBtn = document.querySelector("#copyBtn");
const clearBtn = document.querySelector("#clearBtn");
const outputFormatInputs = document.querySelectorAll('input[name="outputFormat"]');
const resultOutput = document.querySelector("#resultOutput");
const statusText = document.querySelector("#statusText");
const fileName = document.querySelector("#fileName");

const metadata = document.querySelector("#latexMetadata");
const packagesOutput = document.querySelector("#packagesOutput");
const notesOutput = document.querySelector("#notesOutput");
const formulaPreview = document.querySelector("#formulaPreview");
const copyImageBtn = document.querySelector("#copyImageBtn");
let selectedFile = null;
let previewTimer = null;

function clearMetadata() {
  metadata.hidden = true;
  packagesOutput.textContent = "";
  notesOutput.replaceChildren();
}

function showMetadata(data) {
  const packages = Array.isArray(data.packages) ? data.packages : [];
  packagesOutput.textContent = packages.length
    ? packages.map((name) => `\\usepackage{${name}}`).join("\n")
    : "模型未提供宏包建议，请按公式内容核对。";
  notesOutput.replaceChildren();
  for (const note of Array.isArray(data.notes) ? data.notes : []) {
    const item = document.createElement("li");
    item.textContent = note;
    notesOutput.append(item);
  }
  metadata.hidden = getOutputFormat() !== "latex";
}

function schedulePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(renderPreview, 200);
}

function renderPreview() {
  const latex = resultOutput.value.trim();

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
    formulaPreview.replaceChildren(window.MathJax.tex2svg(latex, { display: true }));
  } catch (error) {
    formulaPreview.textContent = `渲染失败：${error.message || error}`;
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

function downloadBlob(blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `formula-${Date.now()}.png`;
  link.click();
  URL.revokeObjectURL(link.href);
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

    downloadBlob(png);
    setStatus("当前浏览器不支持复制图片，已改为下载");
  } catch (error) {
    setStatus(`复制图片失败：${error.message || error}`);
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function getOutputFormat() {
  const selected = [...outputFormatInputs].find((input) => input.checked);
  return selected ? selected.value : "latex";
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
  resultOutput.value = "";
  clearMetadata();
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
  formData.append("format", getOutputFormat());

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

    resultOutput.value = normalizeDisplayedFormula(
      getOutputFormat() === "latex" ? data.latex : data.word,
      getOutputFormat(),
    );
    showMetadata(data);
    renderPreview();
    setStatus("识别完成");
  } catch (error) {
    resultOutput.value = "";
    clearMetadata();
    renderPreview();
    setStatus(error.message);
  } finally {
    recognizeBtn.disabled = false;
  }
}

function normalizeDisplayedFormula(value, format) {
  if (!value) {
    return "";
  }

  const latex = value
    .trim()
    .replace(/[^\S\r\n]+/g, " ")
    .replace(
      /\\int_\(-\\infty\)\^\+\\inftye\^\{-x\^2\}dx/g,
      "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx",
    )
    .replace(
      /\\int_\(-\\infty\)\^\+\\infty\s*e\^\{-x\^2\}dx/g,
      "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx",
    )
    .replace(
      /\\int_\{-\\infty\}\^\{\+\\infty\}\s*e\^\{-x\^\{2\}\}\\,?dx/g,
      "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx",
    )
    .replace(
      /\\int_-\\infty\^\+\\infty▒e\^\(-x\^2\)dx/g,
      "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx",
    )
    .replace(
      /\\int_-\\infty\^\+\\infty▒e\^\(-x\^2\)\s*d\s*x/g,
      "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx",
    );

  if (format === "latex") {
    return latex;
  }

  if (latex === "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx") {
    return latex;
  }

  return latex.replace(
    /\\int_\{-\\infty\}\^\{\+\\infty\}e\^\{-x\^2\}dx/g,
    "\\int_-\\infty^+\\infty▒e^(-x^2)dx",
  );
}

async function copyResult() {
  const text = resultOutput.value.trim();

  if (!text) {
    setStatus("没有可复制的识别结果");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    flashCopyButton();
    setStatus("已复制识别结果");
  } catch {
    resultOutput.focus();
    resultOutput.select();
    document.execCommand("copy");
    flashCopyButton();
    setStatus("已复制识别结果");
  }
}

function flashCopyButton() {
  copyBtn.classList.add("is-copied");
  window.setTimeout(() => copyBtn.classList.remove("is-copied"), 200);
}

function clearAll() {
  selectedFile = null;
  imageInput.value = "";
  resultOutput.value = "";
  clearMetadata();
  renderPreview();
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
clearBtn.addEventListener("click", clearAll);
resultOutput.addEventListener("input", schedulePreview);

window.addEventListener("paste", (event) => {
  const imageFile = getImageFromClipboard(event);

  if (!imageFile) {
    return;
  }

  event.preventDefault();
  setSelectedFile(imageFile, "paste");
});

[...outputFormatInputs].forEach((input) => {
  input.addEventListener("change", () => {
    metadata.hidden = true;
    if (resultOutput.value.trim()) {
      setStatus("输出格式已切换，请重新识别以刷新结果");
    }
  });
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
