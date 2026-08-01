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
  const bytes = await readFile(
    new URL("../images/about/main.webp", import.meta.url),
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
