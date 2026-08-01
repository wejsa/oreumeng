import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("운영 Pages 배포는 main 브랜치에서만 실행된다", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.doesNotMatch(workflow, /refs\/heads\/develop-codex/);
  assert.match(workflow, /refs\/heads\/main/);
});

test("CMS 로컬 자동 미리보기 명령이 등록되어 있다", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(packageJson.scripts["preview:cms"], "node scripts/preview.mjs");
});
