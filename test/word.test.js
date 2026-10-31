const test = require("node:test");
const assert = require("node:assert/strict");

const { latexToUnicodeMath } = require("../lib/word");

test("fractions and radicals become UnicodeMath", () => {
  assert.equal(latexToUnicodeMath(String.raw`\frac{-b+\sqrt{b^{2}-4ac}}{2a}`), "(-b+√(b^2-4ac))/(2a)");
});

test("n-ary operators keep their limits and the operand slot", () => {
  assert.equal(latexToUnicodeMath(String.raw`\int_{0}^{1}x\,dx`), "∫_0^1▒x dx");
  assert.equal(latexToUnicodeMath(String.raw`\sum_{i=1}^{n}i`), "∑_(i=1)^n▒i");
});

test("greek letters and relations become symbols, not command names", () => {
  assert.equal(latexToUnicodeMath(String.raw`\alpha+\beta\le 1`), "α+β≤ 1");
  assert.equal(latexToUnicodeMath(String.raw`\pm\sqrt{b^{2}-4ac}`), "±√(b^2-4ac)");
});

test("text runs keep their characters", () => {
  assert.equal(latexToUnicodeMath(String.raw`\text{若 }x=0`), "若 x=0");
});

test("alignment rows become one line each", () => {
  const input = String.raw`\begin{aligned}y_1&=x\\y_2&=y\end{aligned}`;

  assert.deepEqual(latexToUnicodeMath(input).split("\n"), ["y_1=x", "y_2=y"]);
});

test("nth roots use the order slot", () => {
  assert.equal(latexToUnicodeMath(String.raw`\sqrt[3]{x}`), "√(3&x)");
});

test("unknown commands are dropped instead of leaking a backslash", () => {
  assert.equal(latexToUnicodeMath(String.raw`\unknowncmd{x}`), "x");
});
