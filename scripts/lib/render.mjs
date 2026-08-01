const escapeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => escapeMap[character]);

export const multilineHtml = (value) =>
  String(value).split(/\r?\n/).map(escapeHtml).join("<br>");

export const escapeJsonForHtml = (value) =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/-->/g, "--\\>");

const icons = {
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  layers: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>',
  curtain: '<path d="M4 3h16M4 3v18M20 3v18"/><path d="M4 8c4 0 4 4 8 4s4-4 8-4M4 14c4 0 4 4 8 4s4-4 8-4"/>',
  partition: '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  wind: '<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5-5L7 4l3 3 2.7-2.7a4 4 0 0 0 2 5L6 18l-3 3 3 3 3-3 8.7-8.7a4 4 0 0 0 5-5L20 10l-3-3 2.7-2.7"/>',
};

const iconSvg = (name) => {
  const body = icons[name];
  if (!body) throw new Error(`등록되지 않은 서비스 아이콘입니다: ${name}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
};

const statValue = (stat, currentYear) => {
  if (stat.type === "sinceYear") {
    return `${currentYear - Number(stat.value)}${stat.suffix || ""}`;
  }
  return String(stat.value);
};

export const renderAbout = (about, currentYear) => `
    <!-- About Section -->
    <section class="section" id="about">
        <div class="container">
            <div class="about-grid">
                <div class="about-content">
                    <div class="section-badge">${escapeHtml(about.badge)}</div>
                    <h3>${multilineHtml(about.heading)}</h3>
                    ${about.paragraphs.map((paragraph) => `<p>${multilineHtml(paragraph)}</p>`).join("\n                    ")}
                    <div class="about-stats">
                        ${about.stats
                          .map(
                            (stat, index) => `<div class="stat-item">
                            <div class="stat-number"${stat.type === "sinceYear" ? ' id="experience-years"' : ""}>${escapeHtml(statValue(stat, currentYear))}</div>
                            <div class="stat-label">${escapeHtml(stat.label)}</div>
                        </div>`,
                          )
                          .join("\n                        ")}
                    </div>
                </div>
                <div class="about-image">
                    <img src="${escapeHtml(about.image)}" alt="${escapeHtml(about.imageAlt)}" width="1600" height="1067" loading="lazy">
                </div>
            </div>
        </div>
    </section>`;

export const renderServices = (services) => `
    <!-- Services Section -->
    <section class="section section-dark" id="services">
        <div class="container">
            <div class="section-header">
                <div class="section-badge">SERVICES</div>
                <h2 class="section-title">${multilineHtml(services.sectionTitle)}</h2>
                <p class="section-desc">${multilineHtml(services.sectionDesc)}</p>
            </div>
            <div class="services-grid">
                ${services.items
                  .filter((item) => item.published)
                  .sort((a, b) => a.order - b.order)
                  .map(
                    (item) => `<div class="service-card">
                    <div class="service-icon">${iconSvg(item.icon)}</div>
                    <h3>${multilineHtml(item.title)}</h3>
                    <p>${multilineHtml(item.description)}</p>
                </div>`,
                  )
                  .join("\n                ")}
            </div>
        </div>
    </section>`;

export const renderPortfolio = (portfolio) => {
  const categories = [...portfolio.categories].sort((a, b) => a.order - b.order);
  const cases = [...portfolio.cases]
    .filter((item) => item.published)
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      ...item,
      images: [...item.images].sort((a, b) => a.order - b.order),
    }));

  const galleryData = Object.fromEntries(
    cases.map((item) => [
      item.id,
      {
        title: item.title,
        images: item.images.map(({ file, alt, caption }) => ({ file, alt, caption })),
      },
    ]),
  );

  return `
    <!-- Portfolio Section -->
    <section class="section" id="portfolio">
        <div class="container">
            <div class="section-header">
                <div class="section-badge">PORTFOLIO</div>
                <h2 class="section-title">${multilineHtml(portfolio.sectionTitle)}</h2>
                <p class="section-desc">${multilineHtml(portfolio.sectionDesc)}</p>
            </div>
            <div class="portfolio-tabs">
                <button class="tab-btn active" type="button" onclick="filterPortfolio('all', this)">전체</button>
                ${categories
                  .map(
                    (category) =>
                      `<button class="tab-btn" type="button" onclick="filterPortfolio('${escapeHtml(category.id)}', this)">${escapeHtml(category.label)}</button>`,
                  )
                  .join("\n                ")}
            </div>
            <div class="portfolio-grid">
                ${cases
                  .flatMap((item) =>
                    item.images.map(
                      (image, index) => `<button class="portfolio-item" type="button" data-category="${escapeHtml(item.categoryId)}" onclick="openPortfolioGallery('${escapeHtml(item.id)}', ${index})">
                    <img src="${escapeHtml(image.file.replace(/\.webp$/, "-thumb.webp"))}" alt="${escapeHtml(image.alt)}" width="640" height="${Math.round((image.height / image.width) * 640)}" loading="lazy">
                    <div class="portfolio-overlay">
                        <h4>${multilineHtml(item.title)}</h4>
                        <p>${multilineHtml(image.caption)}</p>
                    </div>
                </button>`,
                    ),
                  )
                  .join("\n                ")}
            </div>
        </div>
        <script id="portfolioGalleryData" type="application/json">${escapeJsonForHtml(galleryData)}</script>
    </section>`;
};

export const renderHead = ({ site, about, portfolio }) => {
  const firstCase = portfolio.cases.find((item) => item.published);
  const cover = firstCase?.images.find((image) => image.id === firstCase.coverImageId);
  const ogImage = new URL(cover?.file || about.image, site.siteUrl).href;
  const description = `${site.address.addressRegion} ${site.address.addressLocality} 시스템실링·크린부스 전문 시공업체 ${site.name}.`;
  return {
    title: `${site.name} - 시스템실링 · 크린부스 전문 시공 | 경기도 안성`,
    description,
    ogImage,
    canonical: site.siteUrl,
  };
};

export const renderJsonLd = (site) => {
  const data = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: site.name,
    url: site.siteUrl,
    telephone: site.telephone,
    email: site.email,
    foundingDate: site.foundingDate,
    taxID: site.taxId,
    address: {
      "@type": "PostalAddress",
      ...site.address,
    },
  };
  if (site.geo && site.geo.latitude && site.geo.longitude) {
    data.geo = { "@type": "GeoCoordinates", ...site.geo };
  }
  return escapeJsonForHtml(data);
};
