import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { multilineHtml } from "../scripts/lib/render.mjs";

test("화면 표시 텍스트의 Enter를 HTML 줄바꿈으로 변환하고 이스케이프한다", () => {
  assert.equal(
    multilineHtml("첫 번째 줄\n두 번째 <줄>"),
    "첫 번째 줄<br>두 번째 &lt;줄&gt;",
  );
});

test("정적 결과물에 핵심 콘텐츠와 SEO 정보가 포함된다", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: root,
    stdio: "pipe",
  });
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const about = JSON.parse(
    await readFile(new URL("../data/about.json", import.meta.url), "utf8"),
  );
  assert.match(html, /<title>.+<\/title>/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /id="about"/);
  assert.ok(html.includes(`<h3>${multilineHtml(about.heading)}</h3>`));
  assert.match(html, /id="services"/);
  assert.match(html, /id="portfolio"/);
  assert.doesNotMatch(html, /fetch\(["']\/api\/content/);
  assert.doesNotMatch(html, /\.(?:jpg|jpeg|png)["']/i);
  assert.match(
    html,
    /\.services-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.doesNotMatch(html, /\.services-grid \.service-card:nth-child/);
  assert.match(html, /\.services-grid\s*\{[^}]*grid-auto-rows:\s*1fr/s);
  assert.match(html, /\.service-card\s*\{[^}]*height:\s*100%/s);
  assert.match(html, /\.service-card\s*\{[^}]*padding:\s*24px 26px/s);
  assert.match(html, /\.service-icon\s*\{[^}]*width:\s*64px[^}]*height:\s*64px/s);
  assert.match(html, /\.lightbox-nav\s*\{[^}]*position:\s*fixed/s);
  assert.match(html, /class="lightbox-nav lightbox-prev"[\s\S]*?<svg[^>]*>[\s\S]*?<\/svg>/);
  assert.match(html, /class="lightbox-nav lightbox-next"[\s\S]*?<svg[^>]*>[\s\S]*?<\/svg>/);
});
