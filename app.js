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
let selectedFile = null;

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
    setStatus("识别完成");
  } catch (error) {
    resultOutput.value = "";
  clearMetadata();
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
clearBtn.addEventListener("click", clearAll);

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
