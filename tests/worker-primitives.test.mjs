import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { imageId, ulid, validImageId, validUlid } from "../worker/src/ids.js";
import { webpDimensions } from "../worker/src/image.js";
import { signReceipt, verifyReceipt } from "../worker/src/receipt.js";
import { watermarkLayout } from "../worker/public/watermark.js";
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

test("포트폴리오 CI를 사진 오른쪽 아래에 비례 배치한다", () => {
  const landscape = watermarkLayout({
    canvasWidth: 1920,
    canvasHeight: 1080,
    logoWidth: 787,
    logoHeight: 248,
  });
  assert.equal(landscape.x + landscape.width < 1920, true);
  assert.equal(landscape.y + landscape.height < 1080, true);
  assert.equal(landscape.width <= 1920 * 0.34 + 1, true);
  assert.equal(landscape.height <= 1080 * 0.25 + 1, true);
  assert.equal(landscape.opacity, 0.55);

  const portrait = watermarkLayout({
    canvasWidth: 1080,
    canvasHeight: 1920,
    logoWidth: 787,
    logoHeight: 248,
  });
  assert.equal(portrait.x > 0, true);
  assert.equal(portrait.y > 0, true);
});

test("포트폴리오 업로드에만 오름이엔지 CI를 합성한다", async () => {
  const adminSource = await readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8");
  assert.match(adminSource, /if \(targetKind === "portfolio"\)/);
  assert.match(adminSource, /await drawPortfolioWatermark\(context, width, height\)/);
  assert.match(adminSource, /CI 합성·업로드 중/);
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

test("관리자 주요 제목과 사진 설명 입력창은 줄바꿈을 지원한다", async () => {
  const [adminHtml, adminSource] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8"),
  ]);
  assert.match(adminHtml, /<input data-bind="services\.sectionTitle"/);
  assert.match(adminHtml, /<input data-bind="portfolio\.sectionTitle"/);
  assert.match(adminSource, /<input data-service-field="title"/);
  assert.match(adminSource, /<textarea data-image-field="caption"/);
});

test("관리자 저장 성공과 실패를 결과 팝업으로 알린다", async () => {
  const [adminHtml, adminSource] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8"),
  ]);
  assert.match(adminHtml, /<dialog id="result-dialog"/);
  assert.match(adminHtml, /id="saving-overlay"/);
  assert.match(adminSource, /showResultDialog\("저장 완료", message\)/);
  assert.match(adminSource, /const message = "저장이 완료되었습니다\."/);
  assert.match(adminSource, /showResultDialog\("저장 실패", "저장에 실패했습니다\.", true\)/);
  assert.match(adminSource, /showSavingOverlay\(true\)[\s\S]*showSavingOverlay\(false\)/);
});

test("현장 첫 사진을 자동 대표로 사용하고 삭제 시 강하게 경고한다", async () => {
  const adminSource = await readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8");
  assert.match(adminSource, /item\.coverImageId = item\.images\[0\]\?\.id/);
  assert.doesNotMatch(adminSource, /data-image-action="cover"/);
  assert.match(adminSource, /삭제한 사진은 저장 후 복구할 수 없습니다/);
  assert.doesNotMatch(adminSource, /Git에서도 함께 제거/);
});

test("관리자 헤더에 오름이엔지 CI를 표시한다", async () => {
  const [adminHtml, adminCss] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.css", import.meta.url), "utf8"),
  ]);
  assert.match(adminHtml, /class="admin-brand"/);
  assert.match(adminHtml, /oreumeng_logo\.svg/);
  assert.doesNotMatch(adminHtml, />OREUM ENG CMS</);
  assert.doesNotMatch(adminCss, /\.admin-brand img\s*\{[^}]*filter:/s);
  assert.match(adminCss, /\.topbar\s*\{[^}]*background:\s*white/s);
  assert.doesNotMatch(adminHtml, /class="admin-hero"/);
});

test("화면에 표시하지 않는 시공 월은 관리자에서 입력받지 않는다", async () => {
  const adminSource = await readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8");
  assert.doesNotMatch(adminSource, /constructedAt/);
  assert.doesNotMatch(adminSource, /시공 월/);
});

test("현장 사진은 설명만 입력받고 대체 텍스트를 자동 생성한다", async () => {
  const adminSource = await readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8");
  assert.doesNotMatch(adminSource, /data-image-field="alt"/);
  assert.match(adminSource, /시공 장소 또는 간단한 설명/);
  assert.match(adminSource, /image\.alt = image\.caption\.trim\(\)/);
});

test("현장 기본 정보는 직접 입력하는 시공 분야와 홈페이지 공개 여부로 구성한다", async () => {
  const [adminSource, adminCss] = await Promise.all([
    readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.css", import.meta.url), "utf8"),
  ]);
  assert.match(adminSource, /class="card-grid case-summary-grid"/);
  assert.match(adminSource, /시공 분야<input data-case-field="title"[^>]*maxlength="40"/);
  assert.doesNotMatch(adminSource, /data-case-field="categoryId"/);
  assert.doesNotMatch(adminSource, />현장명</);
  assert.match(adminSource, /홈페이지에 공개/);
  assert.match(adminSource, /syncPortfolioCategories/);
  assert.match(adminCss, /\.case-summary-grid\s*\{[^}]*grid-template-columns:/s);
});

test("관리자 헤더는 흰색 한 줄에 CI, 제목, 상태, 저장 및 로그아웃 버튼 순으로 배치한다", async () => {
  const [adminHtml, adminCss] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.css", import.meta.url), "utf8"),
  ]);
  assert.match(adminHtml, /class="topbar"[\s\S]*class="admin-brand"[\s\S]*<h1>홈페이지 관리<\/h1>[\s\S]*저장된 상태[\s\S]*변경사항 저장[\s\S]*로그아웃[\s\S]*<\/header>/);
  assert.doesNotMatch(adminHtml, /class="admin-hero"/);
  assert.match(adminCss, /\.topbar\s*\{[^}]*background:\s*white/s);
});

test("관리자 새로고침 시 최근 CMS 배포 상태를 복원한다", async () => {
  const adminSource = await readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8");
  assert.match(adminSource, /const restoreDeploymentStatus/);
  assert.match(adminSource, /trackDeployment\(latestCmsCommit, true\)/);
  assert.match(adminSource, /restoreDeploymentStatus\(state\.latestCmsCommit, state\.deploymentExpected\)/);
});

test("관리자 헤더에서 Cloudflare Access 로그아웃을 제공한다", async () => {
  const [adminHtml, adminSource] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8"),
  ]);
  assert.match(adminHtml, /id="logout-button"[^>]*href="\/cdn-cgi\/access\/logout"[^>]*>로그아웃<\/a>/);
  assert.match(adminSource, /confirmAction\("로그아웃", message/);
  assert.match(adminSource, /저장하지 않은 변경사항이 있습니다/);
});

test("저장 전에 확인 팝업을 표시하고 되돌리기 버튼은 숨긴다", async () => {
  const [adminHtml, adminSource] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(adminHtml, /id="revert-button"/);
  assert.match(adminSource, /현재 변경사항을 저장하고 홈페이지에 반영할까요/);
  assert.match(adminSource, /confirmLabel: "저장"/);
  assert.match(adminSource, /\$\("#revert-button"\)\?\.addEventListener/);
});

test("미사용 회사소개 대체 텍스트와 현장 설명을 입력받지 않는다", async () => {
  const [adminHtml, adminSource] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(adminHtml, /data-bind="about\.imageAlt"/);
  assert.match(adminSource, /const aboutImageAlt/);
  assert.doesNotMatch(adminSource, /data-case-field="description"/);
  assert.doesNotMatch(adminSource, />현장 설명</);
});

test("관리자 로그인 허용 이메일 두 개를 Worker 설정에 유지한다", async () => {
  const config = await readFile(new URL("../worker/wrangler.toml", import.meta.url), "utf8");
  assert.match(config, /ALLOWED_EMAILS\s*=\s*"jaeseong\.sim85@gmail\.com,autocad@paran\.com"/);
});

test("Worker 로그와 운영 배포 브랜치가 설정되어 있다", async () => {
  const [config, source] = await Promise.all([
    readFile(new URL("../worker/wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../worker/src/index.js", import.meta.url), "utf8"),
  ]);
  assert.match(config, /\[observability\][\s\S]*enabled\s*=\s*true[\s\S]*head_sampling_rate\s*=\s*1/);
  assert.match(config, /SITE_DEPLOY_BRANCH\s*=\s*"main"/);
  assert.match(source, /cms\.content_saved/);
  assert.match(source, /request\.failed/);
});

test("관리자 화면은 저장 커밋의 홈페이지 배포 상태를 표시한다", async () => {
  const [adminHtml, adminSource] = await Promise.all([
    readFile(new URL("../worker/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/public/admin.js", import.meta.url), "utf8"),
  ]);
  assert.match(adminHtml, /id="deployment-indicator"/);
  assert.match(adminSource, /\/api\/status\?commit=/);
  assert.match(adminSource, /홈페이지 반영 대기 중/);
  assert.match(adminSource, /홈페이지 반영 완료/);
  assert.match(adminSource, /홈페이지 반영 실패/);
  assert.match(adminSource, /개발 브랜치에 저장됨/);
});
