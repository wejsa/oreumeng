import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { imageId, ulid, validImageId, validUlid } from "../worker/src/ids.js";
import { webpDimensions } from "../worker/src/image.js";
import { signReceipt, verifyReceipt } from "../worker/src/receipt.js";
import worker from "../worker/src/index.js";

test("ULID와 이미지 ID가 허용 형식으로 생성된다", () => {
  assert.equal(validUlid(ulid()), true);
  assert.equal(validImageId(imageId()), true);
});

test("실제 WebP 파일의 크기를 읽는다", async () => {
  const about = JSON.parse(
    await readFile(new URL("../data/about.json", import.meta.url), "utf8"),
  );
  const bytes = await readFile(
    new URL(`../${about.image}`, import.meta.url),
  );
  const dimensions = webpDimensions(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  assert.ok(dimensions.width > 0);
  assert.ok(dimensions.height > 0);
  assert.ok(Math.max(dimensions.width, dimensions.height) <= 1920);
});

test("업로드 영수증 서명을 검증하고 변조를 거부한다", async () => {
  const secret = "test-secret-that-is-long-enough";
  const payload = {
    path: "images/about/img_TEST.webp",
    email: "owner@example.com",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const receipt = await signReceipt(payload, secret);
  assert.deepEqual(await verifyReceipt(receipt, secret), payload);

  const [body, signature] = receipt.split(".");
  const changed = `${body.slice(0, -1)}${body.endsWith("A") ? "B" : "A"}.${signature}`;
  await assert.rejects(() => verifyReceipt(changed, secret));
});

test("Access JWT가 없는 Worker 요청을 차단한다", async () => {
  const response = await worker.fetch(new Request("https://admin.example.test/"), {});
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    code: "unauthorized",
    message: "로그인이 필요합니다.",
  });
});

test("관리자 사진은 인증된 Worker 경로로 표시하고 입력 클릭 시 재렌더링하지 않는다", async () => {
  const adminSource = await readFile(
    new URL("../worker/public/admin.js", import.meta.url),
    "utf8",
  );
  const workerSource = await readFile(
    new URL("../worker/src/index.js", import.meta.url),
    "utf8",
  );

  assert.match(adminSource, /return `\/api\/image\?\$\{params\}`/);
  assert.match(adminSource, /class="icon-preview"/);
  assert.match(adminSource, /data-service-field="icon"/);
  assert.match(
    adminSource,
    /if \(!caseAction && !\(imageElement && imageAction\)\) return;/,
  );
  assert.match(workerSource, /url\.pathname === "\/api\/image"/);
});

test("회사소개 제목 입력창은 줄바꿈을 지원한다", async () => {
  const adminHtml = await readFile(
    new URL("../worker/public/index.html", import.meta.url),
    "utf8",
  );
  assert.match(
    adminHtml,
    /<textarea data-bind="about\.heading"[^>]*><\/textarea>/,
  );
  assert.doesNotMatch(adminHtml, /<input data-bind="about\.heading"/);
});

test("관리자 주요 제목과 사진 내용 입력창은 줄바꿈을 지원한다", async () => {
  const [adminHtml, adminSource] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8"),
  ]);
  assert.match(adminHtml, /<textarea data-bind="services\.sectionTitle"/);
  assert.match(adminHtml, /<textarea data-bind="portfolio\.sectionTitle"/);
  assert.match(adminSource, /<textarea data-service-field="title"/);
  assert.match(adminSource, /<textarea data-case-field="title"/);
  assert.match(adminSource, /<textarea data-image-field="caption"/);
});

test("관리자 저장 성공과 실패를 결과 팝업으로 알린다", async () => {
  const [adminHtml, adminSource] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8"),
  ]);
  assert.match(adminHtml, /<dialog id="result-dialog"/);
  assert.match(adminSource, /showResultDialog\("저장 완료", message\)/);
  assert.match(adminSource, /showResultDialog\("저장 실패", message, true\)/);
});

test("관리자 헤더에 오름이엔지 CI를 표시한다", async () => {
  const [adminHtml, adminCss] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.css", import.meta.url), "utf8"),
  ]);
  assert.match(adminHtml, /class="admin-brand"/);
  assert.match(adminHtml, /oreumeng_logo\.svg/);
  assert.doesNotMatch(adminHtml, />OREUM ENG CMS</);
  assert.match(adminCss, /\.admin-brand img\s*\{[^}]*filter:\s*brightness\(0\) invert\(1\)/s);
  assert.doesNotMatch(adminCss, /\.admin-brand\s*\{[^}]*background:\s*white/s);
});
