import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const categories = [
  { id: "ceiling", label: "시스템실링", order: 1 },
  { id: "cleanroom", label: "크린부스", order: 2 },
  { id: "pannel", label: "판넬타입", order: 3 },
  { id: "curtain", label: "커튼설치", order: 4 },
  { id: "partition", label: "파티션", order: 5 },
];

const sourceGroups = [
  {
    categoryId: "ceiling",
    caseId: "01K00000000000000000000001",
    title: "시스템실링 시공사례",
    description: "시스템실링 및 천장 그리드 시공 사례입니다.",
    sourceDir: "SystemCeiling",
    prefix: "SystemCeiling",
    count: 3,
    caption: "천장 실링 시공",
  },
  {
    categoryId: "cleanroom",
    caseId: "01K00000000000000000000002",
    title: "크린부스 시공사례",
    description: "크린부스 구축 및 내부 시공 사례입니다.",
    sourceDir: "CleanBooth",
    prefix: "CleanBooth",
    count: 7,
    caption: "크린부스 시공",
  },
  {
    categoryId: "pannel",
    caseId: "01K00000000000000000000003",
    title: "판넬타입 시공사례",
    description: "판넬타입 클린환경 시공 사례입니다.",
    sourceDir: "Pannel",
    prefix: "Pannel",
    count: 4,
    caption: "판넬타입 시공",
  },
  {
    categoryId: "curtain",
    caseId: "01K00000000000000000000004",
    title: "커튼설치 시공사례",
    description: "방진 비닐커튼 및 스트립커튼 설치 사례입니다.",
    sourceDir: "Curtain",
    prefix: "Curtain",
    count: 3,
    caption: "커튼 설치 시공",
  },
  {
    categoryId: "partition",
    caseId: "01K00000000000000000000005",
    title: "파티션 시공사례",
    description: "작업공간 분리를 위한 파티션 시공 사례입니다.",
    sourceDir: "Partition",
    prefix: "Partition",
    count: 3,
    caption: "파티션 시공",
  },
];

const services = {
  sectionTitle: "시공 분야",
  sectionDesc: "클린환경 구축에 필요한 모든 시공 서비스를 제공합니다",
  items: [
    {
      id: "system-ceiling",
      title: "시스템실링",
      description:
        "완벽한 마감으로 오염을 차단하며, FFU를 설치하여 내부에 생성된 파티클을 제거하고 청정도를 유지합니다.",
      icon: "grid",
      order: 1,
      published: true,
    },
    {
      id: "clean-booth",
      title: "크린부스",
      description:
        "작업 환경에 맞춘 맞춤형 크린부스 설계 및 시공. 현장 조건을 고려한 최적의 구조로 효율적인 클린 공간을 구축합니다.",
      icon: "home",
      order: 2,
      published: true,
    },
    {
      id: "panel-ffu",
      title: "판넬타입 FFU",
      description:
        "고청정도 환경조건이 아닌 곳의 FFU 시공으로서 일반적으로 1000 CLASS의 청정도에 적합합니다.",
      icon: "layers",
      order: 3,
      published: true,
    },
    {
      id: "curtain",
      title: "커튼설치",
      description:
        "방진 비닐커튼 및 스트립커튼 설치. 공간 분리와 오염 방지를 위한 경제적이고 효율적인 솔루션을 제공합니다.",
      icon: "curtain",
      order: 4,
      published: true,
    },
    {
      id: "partition",
      title: "파티션",
      description:
        "고객 맞춤 작업공간 분리를 위한 프로파일 파티션 설치. 효율적인 공간 활용과 작업 환경 개선을 제공합니다.",
      icon: "partition",
      order: 5,
      published: true,
    },
  ],
};

const about = {
  badge: "ABOUT US",
  heading: "크린룸 시공의\n믿을 수 있는 파트너",
  paragraphs: [
    "오름이엔지는 2018년 설립 이후, 시스템실링 및 크린부스 전문 시공업체로서 반도체, 전자, 연구시설 등 크린룸이 요구되는 다양한 산업 현장을 시공해 왔습니다.",
    "현장의 특성과 고객의 요구사항을 정확히 파악하여, 최적의 크린룸 솔루션을 제공합니다.",
  ],
  stats: [
    { type: "static", value: "100+", label: "시공 현장" },
    { type: "sinceYear", value: 2005, suffix: "년+", label: "시공 경력" },
  ],
  image: "images/about/main.webp",
  imageAlt: "오름이엔지 클린룸 시공 현장",
};

const convert = async (source, destination, maxEdge, quality = 82) => {
  await mkdir(path.dirname(destination), { recursive: true });
  const info = await sharp(source)
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toFile(destination);
  return { width: info.width, height: info.height };
};

const migrate = async () => {
  await readFile(path.join(root, "index.html"), "utf8");
  await mkdir(path.join(root, "data"), { recursive: true });

  await convert(
    path.join(root, "images", "전경1.jpg"),
    path.join(root, "images", "hero.webp"),
    1920,
    84,
  );
  await convert(
    path.join(root, "images", "AboutUs", "main.jpg"),
    path.join(root, "images", "about", "main.webp"),
    1600,
  );

  const cases = [];
  for (const [caseIndex, group] of sourceGroups.entries()) {
    const images = [];
    for (let index = 1; index <= group.count; index += 1) {
      const imageId = `img_${group.categoryId}_${String(index).padStart(2, "0")}`;
      const relativeFile = `images/portfolio/${group.caseId}/${imageId}.webp`;
      const dimensions = await convert(
        path.join(root, "images", group.sourceDir, `${group.prefix}${index}.jpg`),
        path.join(root, relativeFile),
        1920,
      );
      images.push({
        id: imageId,
        file: relativeFile.replaceAll("\\", "/"),
        alt: `${group.title} ${index}`,
        caption: group.caption,
        ...dimensions,
        order: index,
      });
    }
    cases.push({
      id: group.caseId,
      title: group.title,
      categoryId: group.categoryId,
      description: group.description,
      order: caseIndex + 1,
      published: true,
      coverImageId: images[0].id,
      images,
    });
  }

  const portfolio = {
    sectionTitle: "시공 사례",
    sectionDesc: "다양한 현장에서 검증된 시공 품질을 확인하세요",
    categories,
    cases,
  };

  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  await Promise.all([
    writeFile(path.join(root, "data", "about.json"), json(about), "utf8"),
    writeFile(path.join(root, "data", "services.json"), json(services), "utf8"),
    writeFile(path.join(root, "data", "portfolio.json"), json(portfolio), "utf8"),
  ]);
  console.log(`Migrated ${cases.length} cases and ${cases.flatMap((item) => item.images).length} images.`);
};

await migrate();

