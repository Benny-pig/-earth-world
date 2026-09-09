import { test } from "node:test";
import assert from "node:assert/strict";
import { esc } from "../src/lib/esc.js";

test("esc 逸脫 HTML 特殊字元", () => {
  assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});
test("esc 對非字串先轉字串", () => {
  assert.equal(esc(42), "42");
  assert.equal(esc(null), "null");
});
