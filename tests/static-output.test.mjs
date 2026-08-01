import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("정적 결과물에 핵심 콘텐츠와 SEO 정보가 포함된다", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: root,
    stdio: "pipe",
  });
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>.+<\/title>/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /id="about"/);
  assert.match(html, /id="services"/);
  assert.match(html, /id="portfolio"/);
  assert.doesNotMatch(html, /fetch\(["']\/api\/content/);
  assert.doesNotMatch(html, /\.(?:jpg|jpeg|png)["']/i);
});
