// LaTeX 片段 → Word 线性格式（UnicodeMath）。
//
// Word 的线性格式只认 UnicodeMath 符号，不认 TeX 命令名：
//   √(x)  ∫_0^1▒x dx  ∑_(i=1)^n▒i  x^(2)  (a)/(b)  ± ≤ ∞
// 实测（Word 2016 + OMaths.BuildUp）：\sqrt、\frac、\pm、\eqarray 一律不识，
// 会以字面量 "\ sqrt" 的形式留在公式里，所以这里必须做真正的语法转换。

const SYMBOLS = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  pm: "±",
  mp: "∓",
  times: "×",
  div: "÷",
  cdot: "·",
  ast: "∗",
  star: "⋆",
  circ: "∘",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  approx: "≈",
  equiv: "≡",
  sim: "∼",
  simeq: "≃",
  propto: "∝",
  ll: "≪",
  gg: "≫",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  forall: "∀",
  exists: "∃",
  in: "∈",
  notin: "∉",
  ni: "∋",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  setminus: "∖",
  emptyset: "∅",
  varnothing: "∅",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  leftrightarrow: "↔",
  Leftrightarrow: "⇔",
  implies: "⇒",
  iff: "⇔",
  therefore: "∴",
  because: "∵",
  angle: "∠",
  perp: "⊥",
  parallel: "∥",
  degree: "°",
  prime: "′",
  cdots: "⋯",
  ldots: "…",
  dots: "…",
  vdots: "⋮",
  ddots: "⋱",
  quad: " ",
  qquad: "  ",
  ",": " ",
  ";": " ",
  ":": " ",
  "!": "",
  " ": " ",
  left: "",
  right: "",
  big: "",
  Big: "",
  bigg: "",
  Bigg: "",
  bigl: "",
  bigr: "",
  Bigl: "",
  Bigr: "",
  displaystyle: "",
  textstyle: "",
  limits: "",
  nolimits: "",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  cot: "cot",
  sec: "sec",
  csc: "csc",
  arcsin: "arcsin",
  arccos: "arccos",
  arctan: "arctan",
  log: "log",
  ln: "ln",
  lg: "lg",
  exp: "exp",
  lim: "lim",
  max: "max",
  min: "min",
  sup: "sup",
  inf: "inf",
  det: "det",
  gcd: "gcd",
  mod: "mod",
  bmod: "mod",
};

const NARY_SYMBOLS = {
  int: "∫",
  iint: "∬",
  iiint: "∭",
  oint: "∮",
  sum: "∑",
  prod: "∏",
  coprod: "∐",
  bigcup: "⋃",
  bigcap: "⋂",
  bigoplus: "⨁",
  bigotimes: "⨂",
};

const TEXT_COMMANDS = new Set(["text", "mbox", "textrm", "textnormal", "operatorname", "mathrm", "mathbf", "mathit", "mathsf", "mathtt"]);

const ALIGNMENT_ENVIRONMENTS = new Set([
  "aligned",
  "alignedat",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "split",
  "gathered",
  "gather",
  "gather*",
  "cases",
  "array",
]);

function readGroup(source, start) {
  if (source[start] !== "{") {
    return ["", start];
  }

  let depth = 0;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (char === "\\") {
      index += 1;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return [source.slice(start + 1, index), index + 1];
      }
    }
  }

  return [source.slice(start + 1), source.length];
}

function readCommand(source, start) {
  let index = start + 1;

  if (index >= source.length) {
    return ["", index];
  }

  if (/[A-Za-z]/.test(source[index])) {
    while (index < source.length && /[A-Za-z]/.test(source[index])) {
      index += 1;
    }

    return [source.slice(start + 1, index), index];
  }

  return [source[index], index + 1];
}

function readOperand(source, start) {
  let index = start;

  while (source[index] === " ") {
    index += 1;
  }

  if (source[index] === "{") {
    const [group, next] = readGroup(source, index);
    return [convertSegment(group), next];
  }

  if (source[index] === "\\") {
    const [name, next] = readCommand(source, index);
    return [SYMBOLS[name] ?? NARY_SYMBOLS[name] ?? "", next];
  }

  if (index < source.length) {
    return [source[index], index + 1];
  }

  return ["", index];
}

function wrapOperand(operand) {
  if (/^[A-Za-z0-9\u0370-\u03ff]$/.test(operand)) {
    return operand;
  }

  return `(${operand})`;
}

function convertSegment(source) {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === "\\") {
      const [name, next] = readCommand(source, index);
      index = next;

      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const [numerator, afterNumerator] = readGroup(source, index);
        const [denominator, afterDenominator] = readGroup(source, afterNumerator);
        output += `(${convertSegment(numerator)})/(${convertSegment(denominator)})`;
        index = afterDenominator;
        continue;
      }

      if (name === "sqrt") {
        let order = "";
        let afterOrder = index;

        if (source[afterOrder] === "[") {
          const close = source.indexOf("]", afterOrder);
          order = source.slice(afterOrder + 1, close);
          afterOrder = close + 1;
        }

        const [radicand, afterRadicand] = readGroup(source, afterOrder);
        const body = convertSegment(radicand);
        output += order ? `√(${convertSegment(order)}&${body})` : `√(${body})`;
        index = afterRadicand;
        continue;
      }

      if (TEXT_COMMANDS.has(name)) {
        const [text, afterText] = readGroup(source, index);
        output += text;
        index = afterText;
        continue;
      }

      if (name === "begin" || name === "end") {
        const [, afterName] = readGroup(source, index);
        index = afterName;
        continue;
      }

      if (NARY_SYMBOLS[name]) {
        output += NARY_SYMBOLS[name];

        while (true) {
          while (source[index] === " ") {
            index += 1;
          }

          if (source[index] !== "_" && source[index] !== "^") {
            break;
          }

          const mark = source[index];
          const [operand, afterOperand] = readOperand(source, index + 1);
          output += `${mark}${wrapOperand(operand)}`;
          index = afterOperand;
        }

        output += "▒";
        continue;
      }

      if (name === "vec" || name === "bar" || name === "hat" || name === "overline" || name === "underline") {
        const [content, afterContent] = readGroup(source, index);
        output += convertSegment(content);
        index = afterContent;
        continue;
      }

      output += SYMBOLS[name] ?? "";
      continue;
    }

    if (char === "^" || char === "_") {
      const [operand, next] = readOperand(source, index + 1);
      output += `${char}${wrapOperand(operand)}`;
      index = next;
      continue;
    }

    if (char === "{") {
      const [group, next] = readGroup(source, index);
      output += convertSegment(group);
      index = next;
      continue;
    }

    if (char === "&") {
      index += 1;
      continue;
    }

    if (char === "~") {
      output += " ";
      index += 1;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

function splitRows(latex) {
  const rows = [];
  let current = "";
  let depth = 0;

  for (let index = 0; index < latex.length; index += 1) {
    const char = latex[index];

    if (char === "\\") {
      const next = latex[index + 1];

      if (next === "\\" && depth === 0) {
        rows.push(current);
        current = "";
        index += 1;
        continue;
      }

      current += char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }

    current += char;
  }

  rows.push(current);
  return rows.map((row) => row.trim()).filter(Boolean);
}

function latexToUnicodeMath(latex) {
  if (typeof latex !== "string" || !latex.trim()) {
    return "";
  }

  return splitRows(latex)
    .map((row) =>
      convertSegment(row)
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+$/, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

module.exports = {
  latexToUnicodeMath,
  convertSegment,
};
