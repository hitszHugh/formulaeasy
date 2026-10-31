const test = require("node:test");
const assert = require("node:assert/strict");

const { ensureAlignment, normalizeRecognizedLatex, tidyAlignment } = require("../server.js");

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

test("textcircled digits become circled characters", () => {
  assert.equal(normalizeRecognizedLatex("\\textcircled{3}"), "\u2462");
  assert.equal(normalizeRecognizedLatex("\\textcircled {12}"), "\u246b");
  assert.equal(normalizeRecognizedLatex("\\textcircled{99}"), "\\textcircled{99}");
});

test("spacing commands are not mistaken for differentials", () => {
  assert.equal(normalizeRecognizedLatex("\\quad x+4"), "\\quad x+4");
  assert.equal(normalizeRecognizedLatex("\\qquad x+4"), "\\qquad x+4");
  assert.equal(normalizeRecognizedLatex("2dx"), "2\\,dx");
});

test("ragged alignment columns are pushed to a shared left edge", () => {
  const input = "\\begin{aligned}a&=b\\\\&\\Rightarrow c\\\\d&=e\\end{aligned}";
  const output = tidyAlignment(input);
  const rows = output.split("\n").filter((line) => line.trim().startsWith("&"));

  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.trim().startsWith("& ")));
});

test("uniform alignment columns are left untouched", () => {
  const input = "\\begin{aligned}a_1&=b_1\\\\a_2&=b_2\\end{aligned}";

  assert.equal(tidyAlignment(input), input);
});

test("nested environments survive row splitting", () => {
  const input =
    "\\begin{aligned}\\begin{cases}x=1\\\\y=2\\end{cases}&\\Rightarrow z\\\\&\\Rightarrow w\\end{aligned}";
  const output = tidyAlignment(input);

  assert.ok(output.includes("\\begin{cases}x=1\\\\y=2\\end{cases}"), output);
  assert.ok(output.includes("\\end{aligned}"));
});
