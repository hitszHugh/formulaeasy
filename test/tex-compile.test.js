const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseLatexResult } = require("../server.js");
const fixtures = require("./fixtures/cases.js");

let engine = null;
try {
  execFileSync("xelatex", ["--version"], { stdio: "ignore" });
  engine = "xelatex";
} catch {
  engine = null;
}

function buildDocument(latex, packages) {
  const lines = ["\\documentclass{article}"];

  for (const name of [...new Set(packages)]) {
    lines.push(`\\usepackage{${name}}`);
  }

  lines.push("\\begin{document}", "\\[", latex, "\\]", "\\end{document}", "");
  return lines.join("\n");
}

test("every fixture compiles with the packages the model declared", { skip: engine === null && "xelatex not installed" }, () => {
  for (const fixture of fixtures) {
    const result = parseLatexResult(JSON.stringify(fixture.response));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tex-contract-"));

    try {
      fs.writeFileSync(path.join(dir, "case.tex"), buildDocument(result.latex, result.packages), "utf8");

      try {
        execFileSync(engine, ["-interaction=nonstopmode", "-halt-on-error", "case.tex"], {
          cwd: dir,
          stdio: "ignore",
          timeout: 120000,
        });
      } catch {
        // The log below carries the actual TeX error.
      }

      const log = fs.readFileSync(path.join(dir, "case.log"), "utf8");
      const errors = log.split(/\r?\n/).filter((line) => line.startsWith("!"));

      assert.deepEqual(errors, [], `${fixture.name} failed to compile:\n${errors.join("\n")}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
