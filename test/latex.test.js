const test = require("node:test");
const assert = require("node:assert/strict");

const { ensureAlignment, normalizeRecognizedLatex, parseLatexResult } = require("../server.js");

test("alignment tabs escaped as \\& are unescaped inside aligned", () => {
  const input = "\\begin{aligned}a\\&=b\\\\c\\&=d\\end{aligned}";
  const output = ensureAlignment(input);

  assert.equal(output, "\\begin{aligned}a&=b\\\\c&=d\\end{aligned}");
});

test("a literal ampersand inside \\text{} is preserved", () => {
  const input = "\\begin{aligned}\\text{A \\& B}&=c\\end{aligned}";

  assert.equal(ensureAlignment(input), input);
});

test("ampersands outside any alignment environment get wrapped", () => {
  const output = ensureAlignment("a&=b\\\\c&=d");

  assert.ok(output.startsWith("\\begin{aligned}\n"), output);
  assert.ok(output.endsWith("\n\\end{aligned}"), output);
  assert.ok(output.includes("a&=b\\\\c&=d"), output);
});

test("newline separated rows become \\\\ rows when wrapping", () => {
  const output = ensureAlignment("a&=b\nc&=d");

  assert.ok(output.includes("a&=b \\\\\nc&=d"), output);
});

test("fragments without alignment tabs stay untouched", () => {
  const input = "\\frac{-b+\\sqrt{b^2-4ac}}{2a}";

  assert.equal(ensureAlignment(input), input);
});

test("cases environments are not wrapped twice", () => {
  const input = "f(x)=\\begin{cases}x,&x>0\\\\-x,&x\\le 0\\end{cases}";

  assert.equal(ensureAlignment(input), input);
});

test("normalization keeps source newlines", () => {
  const input = "\\begin{aligned}a&=b\\\\\nc&=d\\end{aligned}";

  assert.equal(normalizeRecognizedLatex(input), input);
});

test("circled digits add a typesetting note", () => {
  const result = parseLatexResult(JSON.stringify({ latex: "\\text{① 若 }k=0", packages: ["ctex"], notes: [] }));

  assert.equal(result.notes.length, 1);
  assert.match(result.notes[0], /xeCJKDeclareCharClass/);
});

test("results without circled characters keep their notes untouched", () => {
  const result = parseLatexResult(JSON.stringify({ latex: "a^2+b^2=c^2", notes: ["已有说明"] }));

  assert.deepEqual(result.notes, ["已有说明"]);
});
