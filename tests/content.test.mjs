import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  validateAbout,
  validatePortfolio,
  validateServices,
} from "../scripts/lib/schema.mjs";

const json = async (path) =>
  JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));

test("마이그레이션한 콘텐츠가 스키마를 통과한다", async () => {
  const [about, services, portfolio] = await Promise.all([
    json("data/about.json"),
    json("data/services.json"),
    json("data/portfolio.json"),
  ]);
  assert.equal(validateAbout(about), about);
  assert.equal(validateServices(services), services);
  assert.equal(validatePortfolio(portfolio), portfolio);
  assert.equal(portfolio.cases.length, 5);
  assert.equal(
    portfolio.cases.reduce((sum, item) => sum + item.images.length, 0),
    20,
  );
});

test("서비스 순서 중복을 거부한다", async () => {
  const services = await json("data/services.json");
  services.items[1].order = services.items[0].order;
  assert.throws(() => validateServices(services), /order/);
});

test("현장 밖의 이미지 경로와 없는 대표 사진을 거부한다", async () => {
  const portfolio = await json("data/portfolio.json");
  const badPath = structuredClone(portfolio);
  badPath.cases[0].images[0].file = "images/portfolio/OTHER/photo.webp";
  assert.throws(() => validatePortfolio(badPath));

  const badCover = structuredClone(portfolio);
  badCover.cases[0].coverImageId = "img_missing";
  assert.throws(() => validatePortfolio(badCover));
});
