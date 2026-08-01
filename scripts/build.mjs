import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAll } from "./lib/schema.mjs";
import {
  escapeHtml,
  renderAbout,
  renderHead,
  renderJsonLd,
  renderPortfolio,
  renderServices,
} from "./lib/render.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), "utf8"));

const replaceSection = (html, current, next, rendered) => {
  const pattern = new RegExp(
    `\\s*<!-- ${current} -->[\\s\\S]*?(?=\\s*<!-- ${next} -->)`,
  );
  if (!pattern.test(html)) throw new Error(`${current} 마커를 찾지 못했습니다.`);
  return html.replace(pattern, `\n${rendered}\n\n    `);
};

const contentLastModified = () => {
  if (process.env.SOURCE_DATE_EPOCH) {
    return new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString();
  }
  try {
    return execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", "data", "images/portfolio", "images/about"],
      { cwd: root, encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
};

const copySourceAssets = async () => {
  await cp(path.join(root, "public"), dist, { recursive: true });
  await mkdir(path.join(dist, "images"), { recursive: true });
  await cp(
    path.join(root, "images", "oreumeng_logo.svg"),
    path.join(dist, "images", "oreumeng_logo.svg"),
  );
  await cp(path.join(root, "images", "hero.webp"), path.join(dist, "images", "hero.webp"));
  await cp(path.join(root, "images", "about"), path.join(dist, "images", "about"), {
    recursive: true,
  });
};

const buildPortfolioImages = async (portfolio) => {
  for (const item of portfolio.cases) {
    for (const image of item.images) {
      const source = path.join(root, image.file);
      const target = path.join(dist, image.file);
      const thumbnail = path.join(dist, image.file.replace(/\.webp$/, "-thumb.webp"));
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target);
      await sharp(source)
        .resize({ width: 640, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(thumbnail);
    }
  }
};

const ensureInternalAssets = async (html) => {
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  const missing = [];
  for (const reference of refs) {
    if (
      reference.startsWith("#") ||
      /^(?:https?:|tel:|mailto:|data:)/.test(reference)
    ) {
      continue;
    }
    const clean = reference.split(/[?#]/)[0].replace(/^\/+/, "");
    if (!clean) continue;
    try {
      await access(path.join(dist, clean));
    } catch {
      missing.push(clean);
    }
  }
  if (missing.length) {
    throw new Error(`배포 산출물에 없는 내부 자산: ${[...new Set(missing)].join(", ")}`);
  }
};

const build = async () => {
  const content = validateAll({
    site: await readJson("data/site.json"),
    about: await readJson("data/about.json"),
    services: await readJson("data/services.json"),
    portfolio: await readJson("data/portfolio.json"),
  });
  const currentYear = new Date().getFullYear();
  const head = renderHead(content);
  let html = await readFile(path.join(root, "templates", "index.template.html"), "utf8");

  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(head.title)}</title>`)
    .replace(
      /<meta name="description"[^>]*>/,
      `<meta name="description" content="${escapeHtml(head.description)}">`,
    )
    .replace(
      /<meta property="og:title"[^>]*>/,
      `<meta property="og:title" content="${escapeHtml(head.title)}">`,
    )
    .replace(
      /<meta property="og:description"[^>]*>/,
      `<meta property="og:description" content="${escapeHtml(head.description)}">`,
    )
    .replace(
      /<meta property="og:type" content="website">/,
      `<meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(head.canonical)}">
    <meta property="og:image" content="${escapeHtml(head.ogImage)}">
    <link rel="canonical" href="${escapeHtml(head.canonical)}">
    <link rel="icon" href="images/oreumeng_logo.svg" type="image/svg+xml">
    <link rel="preload" as="image" href="images/hero.webp" fetchpriority="high">
    <script type="application/ld+json">${renderJsonLd(content.site)}</script>`,
    )
    .replaceAll("images/전경1.jpg", "images/hero.webp");

  html = replaceSection(
    html,
    "About Section",
    "Services Section",
    renderAbout(content.about, currentYear),
  );
  html = replaceSection(
    html,
    "Services Section",
    "Portfolio Section",
    renderServices(content.services),
  );
  if (!content.services.items.some((item) => item.published)) {
    html = html.replace(/\s*<a\s+href="#services"[^>]*>[\s\S]*?<\/a>/g, "");
  }
  html = replaceSection(
    html,
    "Portfolio Section",
    "Contact Section",
    renderPortfolio(content.portfolio),
  );

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await copySourceAssets();
  await buildPortfolioImages(content.portfolio);
  await writeFile(path.join(dist, "index.html"), html, "utf8");

  const modified = contentLastModified() || new Date().toISOString();
  const lastmod = modified.slice(0, 10);
  await writeFile(
    path.join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${escapeHtml(content.site.siteUrl)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`,
    "utf8",
  );
  await writeFile(
    path.join(dist, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${new URL("sitemap.xml", content.site.siteUrl).href}\n`,
    "utf8",
  );
  await ensureInternalAssets(html);
  console.log(
    `Built ${content.portfolio.cases.length} cases and ${content.portfolio.cases.flatMap((item) => item.images).length} portfolio images into dist/.`,
  );
};

await build();
