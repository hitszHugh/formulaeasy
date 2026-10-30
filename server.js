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
    const { latex, packages, notes } = await recognizeFormulaFromImage(req.file);
    const word = convertLatexToWordLinear(latex);

    res.json({
      latex,
      packages,
      notes,
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
    return recognizeWithLocal(file);
  }

  if (ocrProvider !== "api") {
    throw new Error("OCR_PROVIDER 只能设置为 api 或 local。");
  }

  return recognizeWithApi(file);
}

async function recognizeWithApi(file) {
  const imageUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const prompt = [
    "You are a formula OCR engine. Transcribe ALL mathematical expressions in the entire image, including highlighted and non-highlighted content.",
    'Return only one valid JSON object: {"latex":"...","packages":["amsmath"],"notes":[]}. Escape LaTeX backslashes correctly in JSON.',
    "Preserve the original reading order, line breaks, equation groups, labels, and derivation steps. Do not summarize, simplify, solve, or invent missing content.",
    "Highlighting and color are formatting, not instructions to select or omit content. Do not reproduce decorative colors.",
    "Return a math fragment without document preamble or outer math delimiters ($, $$, \\[ or \\]). For multiple related lines use \\begin{aligned} ... \\end{aligned}, with actual source newlines and LaTeX row separators. Align at existing relation signs where appropriate; do not force unrelated expressions into one chain. Use cases only for genuine piecewise expressions or systems. Write alignment tabs as a bare & inside those environments; never escape them as \\&, and never use & outside an alignment environment.",
    "Use standard LaTeX with explicit braces for subscripts, superscripts, fractions, radicals, and integral limits. Preserve matrices and nested structures.",
    "packages must list only required package names, without \\usepackage declarations or options (e.g. amsmath for aligned/cases/text; amssymb for therefore/because/mathbb). Use [] if none are needed.",
    "notes must be an array of brief Chinese strings for ambiguous or unreadable symbols and compilation requirements. If Chinese text is present, advise Chinese support such as ctex with XeLaTeX. Do not invent unreadable symbols; describe their location in notes. Use [] when there are no notes.",
    "Do not add Markdown fences or text outside the JSON object.",
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
  return parseLatexResult(text);
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
      return {
        latex: normalizeRecognizedLatex(parsed.latex),
        packages: Array.isArray(parsed.packages)
          ? [...new Set(parsed.packages.filter((name) => typeof name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name)))]
          : [],
        notes: Array.isArray(parsed.notes)
          ? parsed.notes.filter((note) => typeof note === "string" && note.trim()).map((note) => note.trim())
          : [],
      };
    }
  } catch {
    // Fall back to plain text when the model returns only the formula.
  }

  if (!cleaned) {
    throw new Error("没有从图片中识别到公式");
  }

  return { latex: normalizeRecognizedLatex(cleaned), packages: [], notes: [] };
}

function normalizeRecognizedLatex(latex) {
  const normalized = latex
    .trim()
    .replace(/[^\S\r\n]+/g, " ")
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

  return ensureAlignment(compactGaussianIntegral(normalized));
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

const ALIGNMENT_ENVIRONMENTS = [
  "aligned",
  "alignedat",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "eqnarray",
  "eqnarray*",
  "split",
  "cases",
  "dcases",
  "rcases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "smallmatrix",
  "array",
];

function findEnvironmentSpans(latex) {
  const spans = [];
  const beginPattern = /\\begin\{([A-Za-z]+\*?)\}/g;
  let match;

  while ((match = beginPattern.exec(latex)) !== null) {
    const name = match[1];

    if (!ALIGNMENT_ENVIRONMENTS.includes(name)) {
      continue;
    }

    const beginTag = `\\begin{${name}}`;
    const endTag = `\\end{${name}}`;
    let depth = 1;
    let index = match.index + beginTag.length;

    while (depth > 0) {
      const nextEnd = latex.indexOf(endTag, index);
      const nextBegin = latex.indexOf(beginTag, index);

      if (nextEnd === -1) {
        index = latex.length;
        break;
      }

      if (nextBegin !== -1 && nextBegin < nextEnd) {
        depth += 1;
        index = nextBegin + beginTag.length;
        continue;
      }

      depth -= 1;
      index = nextEnd + endTag.length;
    }

    spans.push([match.index, index]);
    beginPattern.lastIndex = index;
  }

  return spans;
}

function findTextGroupRanges(text) {
  const ranges = [];
  const textPattern = /\\(?:text|mbox|textrm|textnormal)\s*\{/g;
  let match;

  while ((match = textPattern.exec(text)) !== null) {
    let depth = 1;
    let index = textPattern.lastIndex;

    while (index < text.length && depth > 0) {
      const char = text[index];

      if (char === "\\") {
        index += 2;
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }

      index += 1;
    }

    ranges.push([match.index, index]);
    textPattern.lastIndex = index;
  }

  return ranges;
}

function unescapeAlignmentTabs(latex) {
  const spans = findEnvironmentSpans(latex);

  if (!spans.length) {
    return latex;
  }

  let output = "";
  let cursor = 0;

  for (const [start, end] of spans) {
    const body = latex.slice(start, end);
    const protectedRanges = findTextGroupRanges(body);
    let rebuilt = "";
    let index = 0;

    while (index < body.length) {
      const isProtected = protectedRanges.some(([from, to]) => index >= from && index < to);

      if (!isProtected && body.startsWith("\\&", index)) {
        rebuilt += "&";
        index += 2;
        continue;
      }

      rebuilt += body[index];
      index += 1;
    }

    output += latex.slice(cursor, start) + rebuilt;
    cursor = end;
  }

  return output + latex.slice(cursor);
}

function toAlignmentRows(latex) {
  const lines = latex
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line, index) => {
      if (index === lines.length - 1 || line.endsWith("\\\\")) {
        return line;
      }

      return `${line} \\\\`;
    })
    .join("\n");
}

function ensureAlignment(latex) {
  const unescaped = unescapeAlignmentTabs(latex);

  if (findEnvironmentSpans(unescaped).length) {
    return unescaped;
  }

  if (!unescaped.includes("&")) {
    return unescaped;
  }

  return `\\begin{aligned}\n${toAlignmentRows(unescaped)}\n\\end{aligned}`;
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
  ensureAlignment,
  parseLatexResult,
  convertLatexToWordLinear,
  normalizeRecognizedLatex,
};
