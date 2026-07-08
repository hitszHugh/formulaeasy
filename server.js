const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const multer = require("multer");
const os = require("os");
const path = require("path");

loadLocalEnv(path.join(__dirname, ".env"));

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";
const ocrProvider = (process.env.OCR_PROVIDER || "api").toLowerCase();
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiBaseUrl = normalizeBaseUrl(
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
);
const ocrModel = process.env.OCR_MODEL || "gpt-4o";
const hasOpenaiApiKey = Boolean(openaiApiKey);

app.use(express.static(__dirname));

app.post("/api/recognize", upload.single("formulaImage"), async (req, res) => {
  if (ocrProvider === "api" && !hasOpenaiApiKey) {
    res.status(500).json({
      error: "缺少 OPENAI_API_KEY。请在 .env 文件或终端环境变量中设置后重启服务。",
    });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "请上传一张公式图片" });
    return;
  }

  try {
    const latex = await recognizeFormulaFromImage(req.file);
    const word = convertLatexToWordLinear(latex);

    res.json({
      latex,
      word,
      result: req.body.format === "latex" ? latex : word,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: formatRecognitionError(error),
    });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

if (require.main === module) {
  console.log("OPENAI_API_KEY =", hasOpenaiApiKey ? "已读取" : "未读取");
  console.log("OCR_PROVIDER =", ocrProvider);
  console.log("OPENAI_BASE_URL =", openaiBaseUrl);
  app.listen(port, host, () => {
    console.log(`Math Formula is running at http://localhost:${port}`);
    for (const url of getLocalNetworkUrls(port)) {
      console.log(`LAN URL: ${url}`);
    }
  });
}

async function recognizeFormulaFromImage(file) {
  if (ocrProvider === "local") {
    const latex = await recognizeWithLocal(file);
    return normalizeRecognizedLatex(latex);
  }

  if (ocrProvider !== "api") {
    throw new Error("OCR_PROVIDER 只能设置为 api 或 local。");
  }

  return recognizeWithApi(file);
}

async function recognizeWithApi(file) {
  const imageUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const prompt = [
    "You are a formula OCR engine.",
    "Read the mathematical formula in the image and return only one JSON object.",
    "The JSON shape must be {\"latex\":\"...\"}.",
    "Use standard LaTeX with explicit braces for all subscripts and superscripts.",
    "Use \\frac for fractions, \\sqrt for radicals, \\sum_{...}^{...} for summations, and \\sin/\\cos/\\tan for trigonometric functions.",
    "For definite integrals, always use \\int_{lower}^{upper} integrand \\, dx.",
    "Never merge an integral limit with the integrand; for example use \\int_{-\\infty}^{+\\infty} e^{-x^{2}} \\, dx.",
    "Use {+\\infty} or {-\\infty} as complete grouped limits when infinity appears as a limit.",
    "For the Gaussian integral from negative infinity to positive infinity, return exactly \\int_{-\\infty}^{+\\infty}e^{-x^2}dx.",
    "Do not add explanations, Markdown, code fences, or surrounding text.",
  ].join(" ");

  let response;

  try {
    response = await fetch(`${openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ocrModel,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    throw new Error(buildNetworkErrorMessage(error), { cause: error });
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI 图片识别接口调用失败");
  }

  const text = extractOutputText(data);
  return normalizeRecognizedLatex(parseLatexResult(text));
}

async function recognizeWithLocal(file) {
  const pythonCommand = process.env.LOCAL_OCR_PYTHON || "python";
  const scriptPath = process.env.LOCAL_OCR_SCRIPT || path.join(__dirname, "ocr", "local_ocr.py");
  const imagePath = await writeTempImage(file);

  try {
    const output = await runProcess(pythonCommand, [scriptPath, imagePath]);
    return parseLatexResult(output);
  } finally {
    fs.promises.unlink(imagePath).catch(() => {});
    fs.promises.rmdir(path.dirname(imagePath)).catch(() => {});
  }
}

async function writeTempImage(file) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "math-copy-"));
  const ext = getImageExtension(file.mimetype);
  const imagePath = path.join(tempDir, `formula${ext}`);
  await fs.promises.writeFile(imagePath, file.buffer);
  return imagePath;
}

function getImageExtension(mimetype) {
  const map = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
  };

  return map[mimetype] || ".png";
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: __dirname,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `本地 OCR 启动失败：${error.message}。请检查 LOCAL_OCR_PYTHON 和 LOCAL_OCR_SCRIPT 配置。`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(
        new Error(
          stderr.trim() ||
            `本地 OCR 退出码为 ${code}。请先安装本地公式识别模型依赖。`,
        ),
      );
    });
  });
}

function buildNetworkErrorMessage(error) {
  const cause = error.cause || error;
  const code = cause.code || error.code;

  if (code === "EACCES") {
    return `Node 无法连接图片识别 API：连接被系统、防火墙、代理或网络策略拒绝。当前地址是 ${openaiBaseUrl}，请检查 OPENAI_BASE_URL 是否可访问，或允许 node.exe 访问网络。`;
  }

  if (code === "ENOTFOUND") {
    return `Node 无法解析图片识别 API 地址：${openaiBaseUrl}。请检查 OPENAI_BASE_URL、DNS、网络或代理设置。`;
  }

  if (code === "ETIMEDOUT" || code === "ECONNRESET") {
    return "连接 OpenAI API 超时或被重置：请检查网络、代理/VPN 是否稳定。";
  }

  return `连接图片识别 API 失败：${error.message || "未知网络错误"}`;
}

function formatRecognitionError(error) {
  return error.message || "图片识别失败，请换一张更清晰的截图再试";
}

function extractOutputText(responseData) {
  const chatText = responseData.choices?.[0]?.message?.content;
  if (typeof chatText === "string") {
    return chatText.trim();
  }

  if (responseData.output_text) {
    return responseData.output_text;
  }

  const chunks = [];
  for (const item of responseData.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function normalizeBaseUrl(url) {
  return url.trim().replace(/\/+$/, "");
}

function getLocalNetworkUrls(portNumber) {
  const urls = [];
  const networks = os.networkInterfaces();

  for (const entries of Object.values(networks)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${portNumber}`);
      }
    }
  }

  return urls;
}

function parseLatexResult(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json|latex)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.latex === "string" && parsed.latex.trim()) {
      return parsed.latex.trim();
    }
  } catch {
    // Fall back to plain text when the model returns only the formula.
  }

  if (!cleaned) {
    throw new Error("没有从图片中识别到公式");
  }

  return cleaned;
}

function normalizeRecognizedLatex(latex) {
  const normalized = latex
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\\int_\(([^()]+)\)\^\+\\inftye/g, "\\int_{$1}^{+\\infty} e")
    .replace(/\\int_\(([^()]+)\)\^\+\\infty\s*e/g, "\\int_{$1}^{+\\infty} e")
    .replace(/\\int_\(([^()]+)\)\^\(([^()]+)\)/g, "\\int_{$1}^{$2}")
    .replace(/\\int_\{([^{}]+)\}\^\+\\infty\s*e/g, "\\int_{$1}^{+\\infty} e")
    .replace(/\\int_\{([^{}]+)\}\^\{([^{}]+)\}e/g, "\\int_{$1}^{$2} e")
    .replace(/\\int_\{([^{}]+)\}\^\{([^{}]+)\}\s*e\^\{?-x\^?2\}?/g, "\\int_{$1}^{$2} e^{-x^{2}}")
    .replace(/e\^\{-x\^2\}/g, "e^{-x^{2}}")
    .replace(/e\^\(-x\^2\)/g, "e^{-x^{2}}")
    .replace(/e\^\{-x\^\{2\}\}/g, "e^{-x^{2}}")
    .replace(/\s*d\s*x\b/g, "\\,dx")
    .replace(/([^\\])dx\b/g, "$1\\,dx")
    .replace(/(?:\\,)+dx/g, "\\,dx")
    .replace(/\s*\\,dx/g, "\\,dx")
    .trim();

  return compactGaussianIntegral(normalized);
}

function compactGaussianIntegral(latex) {
  return latex
    .replace(
      /\\int_\(-\\infty\)\^\+\\infty\s*e\^\{-x\^2\}dx/g,
      "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx",
    )
    .replace(
      /\\int_\(-\\infty\)\^\+\\inftye\^\{-x\^2\}dx/g,
      "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx",
    )
    .replace(
      /\\int_\{-\\infty\}\^\{\+\\infty\}\s*e\^\{-x\^\{2\}\}\\,dx/g,
      "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx",
    )
    .replace(
      /\\int_\{-\\infty\}\^\{\+\\infty\}\s*e\^\{-x\^2\}\\?[,]?dx/g,
      "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx",
    );
}

function convertLatexToWordLinear(latex) {
  if (latex.trim() === "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx") {
    return "\\int_{-\\infty}^{+\\infty}e^{-x^2}dx";
  }

  return latex
    .replace(/\\left\s*/g, "")
    .replace(/\\right\s*/g, "")
    .replace(/\\sum_\{([^{}]+)\}\^\{([^{}]+)\}/g, "\\sum_($1)^($2)▒")
    .replace(/\\prod_\{([^{}]+)\}\^\{([^{}]+)\}/g, "\\prod_($1)^($2)▒")
    .replace(/\\int_\{([^{}]+)\}\^\{([^{}]+)\}/g, "\\int_$1^$2▒")
    .replace(/e\^\{-x\^\{2\}\}/g, "e^(-x^2)")
    .replace(/e\^\{-x\^2\}/g, "e^(-x^2)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "\\sqrt($1)")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/([A-Za-z])_\{([^{}]+)\}/g, "$1_($2)")
    .replace(/\^\{([^{}]+)\}/g, "^($1)")
    .replace(/\\,d([A-Za-z])/g, " d$1")
    .replace(/\\,/g, " ")
    .replace(/\s*▒\s*/g, "▒")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

module.exports = {
  convertLatexToWordLinear,
  normalizeRecognizedLatex,
};
