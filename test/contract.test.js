const test = require("node:test");
const assert = require("node:assert/strict");

const { parseLatexResult } = require("../server.js");
const fixtures = require("./fixtures/cases.js");

for (const fixture of fixtures) {
  test(`contract: ${fixture.name}`, () => {
    const result = parseLatexResult(JSON.stringify(fixture.response));

    assert.ok(result.latex.trim(), "latex must not be empty");
    assert.ok(!/^\s*(\$|\\\[)/.test(result.latex), "latex must be a fragment without outer math delimiters");
    assert.ok(!/\$\s*$/.test(result.latex), "latex must not end with a closing dollar");

    assert.ok(Array.isArray(result.packages), "packages must be an array");
    assert.ok(Array.isArray(result.notes), "notes must be an array");
    assert.ok(result.notes.every((note) => typeof note === "string" && note.trim()), "notes must be non-empty strings");

    for (const name of fixture.expect.packages) {
      assert.ok(result.packages.includes(name), `expected package ${name} in ${JSON.stringify(result.packages)}`);
    }

    assert.equal(
      result.latex.includes("\n"),
      fixture.expect.newlines,
      fixture.expect.newlines ? "multi-line input must keep its line breaks" : "single-line input must stay on one line",
    );

    if (result.latex.includes("&")) {
      assert.match(
        result.latex,
        /\\begin\{(aligned|alignedat|cases|dcases|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|array|split)\}/,
        "an ampersand must live inside an alignment environment",
      );
    }

    assert.equal(parseLatexResult(JSON.stringify(fixture.response)).latex, result.latex, "parsing must be idempotent");
  });
}
