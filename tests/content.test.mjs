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
  assert.ok(portfolio.cases.length > 0);
  assert.ok(portfolio.cases.every((item) => item.images.length > 0));
});

test("서비스와 포트폴리오 영역 제목은 한 줄만 허용한다", async () => {
  const [services, portfolio] = await Promise.all([
    json("data/services.json"),
    json("data/portfolio.json"),
  ]);
  services.sectionTitle = "첫 줄\n둘째 줄";
  portfolio.sectionTitle = "첫 줄\n둘째 줄";
  assert.throws(() => validateServices(services), /한 줄/);
  assert.throws(() => validatePortfolio(portfolio), /한 줄/);
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
