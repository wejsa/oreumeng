const text = (value, name, max = 500) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${name}: 1~${max}자의 문자열이어야 합니다.`);
  }
};

const unique = (values, name) => {
  if (new Set(values).size !== values.length) {
    throw new Error(`${name}: 중복 값이 있습니다.`);
  }
};

const ordered = (items, name) => {
  const orders = items.map((item) => item.order);
  if (orders.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new Error(`${name}.order: 1 이상의 정수여야 합니다.`);
  }
  unique(orders, `${name}.order`);
};

const safeImagePath = (value, prefix, name) => {
  text(value, name, 300);
  if (
    !value.startsWith(prefix) ||
    value.includes("..") ||
    value.includes("\\") ||
    !value.endsWith(".webp")
  ) {
    throw new Error(`${name}: 허용되지 않은 이미지 경로입니다.`);
  }
};

export const validateSite = (site) => {
  text(site.name, "site.name", 80);
  text(site.siteUrl, "site.siteUrl", 200);
  text(site.telephone, "site.telephone", 30);
  text(site.email, "site.email", 120);
  text(site.foundingDate, "site.foundingDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(site.foundingDate)) {
    throw new Error("site.foundingDate: YYYY-MM-DD 형식이어야 합니다.");
  }
  if (!Number.isInteger(site.experienceSinceYear)) {
    throw new Error("site.experienceSinceYear: 정수여야 합니다.");
  }
  for (const key of [
    "streetAddress",
    "addressLocality",
    "addressRegion",
    "addressCountry",
  ]) {
    text(site.address?.[key], `site.address.${key}`, 120);
  }
  return site;
};

export const validateAbout = (about) => {
  text(about.badge, "about.badge", 40);
  text(about.heading, "about.heading", 120);
  if (!Array.isArray(about.paragraphs) || about.paragraphs.length < 1) {
    throw new Error("about.paragraphs: 문단이 한 개 이상 필요합니다.");
  }
  about.paragraphs.forEach((value, index) =>
    text(value, `about.paragraphs[${index}]`, 1000),
  );
  if (!Array.isArray(about.stats) || about.stats.length !== 2) {
    throw new Error("about.stats: 통계 두 개가 필요합니다.");
  }
  about.stats.forEach((stat, index) => {
    if (!["static", "sinceYear"].includes(stat.type)) {
      throw new Error(`about.stats[${index}].type: 허용되지 않은 값입니다.`);
    }
    text(String(stat.value), `about.stats[${index}].value`, 20);
    text(stat.label, `about.stats[${index}].label`, 40);
  });
  safeImagePath(about.image, "images/about/", "about.image");
  text(about.imageAlt, "about.imageAlt", 160);
  return about;
};

export const validateServices = (services) => {
  text(services.sectionTitle, "services.sectionTitle", 80);
  text(services.sectionDesc, "services.sectionDesc", 240);
  if (!Array.isArray(services.items) || services.items.length < 1) {
    throw new Error("services.items: 서비스가 한 개 이상 필요합니다.");
  }
  unique(services.items.map((item) => item.id), "services.items.id");
  ordered(services.items, "services.items");
  services.items.forEach((item, index) => {
    if (!/^[a-z0-9-]+$/.test(item.id)) {
      throw new Error(`services.items[${index}].id: 형식이 잘못되었습니다.`);
    }
    text(item.title, `services.items[${index}].title`, 80);
    text(item.description, `services.items[${index}].description`, 500);
    text(item.icon, `services.items[${index}].icon`, 40);
    if (typeof item.published !== "boolean") {
      throw new Error(`services.items[${index}].published: boolean이 필요합니다.`);
    }
  });
  return services;
};

export const validatePortfolio = (portfolio) => {
  text(portfolio.sectionTitle, "portfolio.sectionTitle", 80);
  text(portfolio.sectionDesc, "portfolio.sectionDesc", 240);
  if (!Array.isArray(portfolio.categories) || portfolio.categories.length < 1) {
    throw new Error("portfolio.categories: 카테고리가 필요합니다.");
  }
  unique(portfolio.categories.map((item) => item.id), "portfolio.categories.id");
  ordered(portfolio.categories, "portfolio.categories");
  const categoryIds = new Set(portfolio.categories.map((item) => item.id));
  portfolio.categories.forEach((category, index) => {
    if (!/^[a-z0-9-]+$/.test(category.id)) {
      throw new Error(`portfolio.categories[${index}].id: 형식이 잘못되었습니다.`);
    }
    text(category.label, `portfolio.categories[${index}].label`, 80);
  });

  if (!Array.isArray(portfolio.cases)) {
    throw new Error("portfolio.cases: 배열이어야 합니다.");
  }
  unique(portfolio.cases.map((item) => item.id), "portfolio.cases.id");
  ordered(portfolio.cases, "portfolio.cases");

  portfolio.cases.forEach((item, caseIndex) => {
    if (!/^[A-Z0-9-]{8,40}$/.test(item.id)) {
      throw new Error(`portfolio.cases[${caseIndex}].id: 형식이 잘못되었습니다.`);
    }
    text(item.title, `portfolio.cases[${caseIndex}].title`, 40);
    text(item.description, `portfolio.cases[${caseIndex}].description`, 600);
    if (!categoryIds.has(item.categoryId)) {
      throw new Error(`portfolio.cases[${caseIndex}].categoryId: 없는 카테고리입니다.`);
    }
    if (typeof item.published !== "boolean") {
      throw new Error(`portfolio.cases[${caseIndex}].published: boolean이 필요합니다.`);
    }
    if (!Array.isArray(item.images) || item.images.length < 1 || item.images.length > 50) {
      throw new Error(`portfolio.cases[${caseIndex}].images: 1~50장이 필요합니다.`);
    }
    unique(item.images.map((image) => image.id), `portfolio.cases[${caseIndex}].images.id`);
    ordered(item.images, `portfolio.cases[${caseIndex}].images`);
    const imageIds = new Set(item.images.map((image) => image.id));
    if (!imageIds.has(item.coverImageId)) {
      throw new Error(`portfolio.cases[${caseIndex}].coverImageId: 없는 이미지입니다.`);
    }
    item.images.forEach((image, imageIndex) => {
      if (!/^img_[a-zA-Z0-9_-]+$/.test(image.id)) {
        throw new Error(
          `portfolio.cases[${caseIndex}].images[${imageIndex}].id: 형식이 잘못되었습니다.`,
        );
      }
      safeImagePath(
        image.file,
        `images/portfolio/${item.id}/`,
        `portfolio.cases[${caseIndex}].images[${imageIndex}].file`,
      );
      text(image.alt, `portfolio.cases[${caseIndex}].images[${imageIndex}].alt`, 180);
      text(image.caption, `portfolio.cases[${caseIndex}].images[${imageIndex}].caption`, 240);
      if (
        !Number.isInteger(image.width) ||
        !Number.isInteger(image.height) ||
        image.width < 1 ||
        image.height < 1 ||
        Math.max(image.width, image.height) > 1920
      ) {
        throw new Error(
          `portfolio.cases[${caseIndex}].images[${imageIndex}]: 크기가 잘못되었습니다.`,
        );
      }
    });
  });
  return portfolio;
};

export const validateAll = ({ site, about, services, portfolio }) => ({
  site: validateSite(site),
  about: validateAbout(about),
  services: validateServices(services),
  portfolio: validatePortfolio(portfolio),
});
