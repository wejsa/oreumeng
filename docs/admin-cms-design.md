# 오름이엔지 홈페이지 관리자(CMS) 설계 문서

| 항목 | 내용 |
|---|---|
| 문서 버전 | 1.1 |
| 작성일 | 2026-07-26 |
| 대상 저장소 | `oreumeng-codex` / 브랜치 `develop-codex` |
| 관리 범위 | About · Services · Portfolio |
| 제외 범위 | 방문자 문의 폼 (향후 확장, 11장 참조) |
| 월 운영 비용 | 0원 |

> **브랜치 불변 규칙:** 이 CMS의 콘텐츠 저장, 빌드, 배포는 `develop-codex` 브랜치만 사용합니다. `main`에는 병합, 직접 커밋, CMS 저장, Pages 배포를 하지 않습니다. Worker의 `GH_BRANCH`와 Actions의 트리거도 반드시 `develop-codex`로 고정합니다.

---

## 1. 배경과 목표

### 1.1 현재 상태

`index.html` 단일 파일(1,573줄)에 CSS·JS·콘텐츠·이미지 경로가 전부 인라인으로 들어 있는 정적 사이트입니다. GitHub Pages로 배포되며 도메인은 `oreumeng.co.kr`(가비아 DNS)입니다.

문제는 **콘텐츠 수정이 곧 코드 수정**이라는 점입니다. 시공 사진 한 장을 추가하려면 HTML 8줄을 복사해 붙이고 커밋해야 합니다. 비개발자인 대표가 직접 할 수 없습니다.

### 1.2 목표

1. 대표가 브라우저에서 직접 회사소개·시공분야·시공사례를 관리
2. 시공 사례를 **현장 단위**로 묶고, 한 현장에 여러 장의 사진을 등록
3. **검색 노출을 현재보다 떨어뜨리지 않을 것** — 이것이 최우선 제약
4. 고정비 0원, 방치해도 멈추지 않을 것

### 1.3 최우선 제약: SEO를 깎지 않는다

이 사이트의 존재 이유는 "안성 크린부스" 같은 검색을 통한 전화 문의입니다. 콘텐츠를 DB로 옮기고 **브라우저에서 fetch해 그리는 방식은 이 목표와 정면으로 충돌합니다.**

- 초기 HTML이 빈 껍데기가 되어, 크롤러가 처음 받는 문서에 콘텐츠가 없습니다.
- 구글은 JS를 렌더링하지만 2단계 인덱싱이라 지연·누락이 발생합니다.
- **네이버 검색로봇(Yeti)은 JS 실행이 사실상 안 됩니다.** 국내 지역 시공업체에게 네이버는 구글보다 중요합니다.

따라서 이 설계는 **빌드 시점에 정적 HTML을 생성(SSG)** 하는 방식을 택합니다. 방문자가 받는 결과물은 지금과 동일한 순수 정적 HTML이며, 런타임 API 호출이 0회이므로 오히려 현재보다 빠릅니다.

---

## 2. 아키텍처

```
[관리자]
  https://oreumeng-admin.<계정>.workers.dev
    │
    ├─ Cloudflare Access (이메일 일회용 인증번호)
    │
    ▼
  Cloudflare Worker  ── 1차 방어: Access
    │                 ── 2차 방어: Worker 내 Access JWT 검증
    │
    │  GitHub 토큰은 Worker Secret에만 존재 (브라우저로 절대 전달 안 됨)
    ▼
  GitHub Git Data API  ── data/*.json + images/** 를 단일 커밋으로 develop-codex에 push
    │
    ▼
  GitHub Actions  ── JSON + 템플릿 → index.html / sitemap.xml / JSON-LD 생성
    │              ── 파생 이미지(WebP 썸네일) 생성
    ▼
  GitHub Pages 배포

[방문자]
  https://oreumeng.co.kr  →  가비아 DNS  →  GitHub Pages  →  완성된 정적 HTML
                                                             (Cloudflare·API 경유 없음)
```

### 2.1 이 구조를 택한 이유

| 결정 | 이유 |
|---|---|
| DNS를 가비아에 유지 | MX·SPF·DKIM·DMARC 이관 시 회사 이메일 장애 위험. 이득 없이 리스크만 발생 |
| 관리자 주소를 `workers.dev`로 | 도메인을 Cloudflare에 올리지 않고도 Access 적용 가능. Workers 대시보드에서 원클릭 |
| 데이터를 DB가 아닌 Git에 | 텍스트 몇 문단 + 사진 수십 장. 조인·검색·페이징이 없어 SQL이 풀 문제가 없음 |
| 이미지도 Git에 | WebP 변환 시 전체 2MB 내외. 별도 오브젝트 스토리지 불필요 |
| 렌더링을 빌드 시점에 | SEO 손실 0. 무료 한도 소모 0. 외부 서비스가 죽어도 사이트는 살아있음 |

### 2.2 검토했으나 채택하지 않은 안

| 안 | 기각 사유 |
|---|---|
| Supabase 무료 | **7일간 DB 요청이 없으면 자동 일시정지.** 재개는 대시보드 수동 조작. 90일 경과 시 원클릭 복구 불가 |
| Supabase Pro | 월 $25. 이 규모에 지출 근거 부족 |
| Cloudflare D1 + R2 | 일일 읽기 한도 초과 시 API가 에러를 반환 → 클라이언트 렌더링과 결합되면 사이트 백지. 구성요소 4개는 과설계 |
| 기성 CMS (Decap 등) | 화면이 3개뿐이고 사용자가 1명. 한국어 라벨과 현장 용어에 맞춘 자체 UI가 학습 곡선이 더 낮음 |

### 2.3 이 구조에서 사라지는 문제들

- **트랜잭션 문제**: JSON 수정과 이미지 삭제가 하나의 Git 커밋에 담깁니다. 성공하면 둘 다, 실패하면 둘 다 반영되지 않습니다. "DB는 지워졌는데 스토리지 파일이 남는" 상황이 구조적으로 발생하지 않습니다.
- **버전 이력**: Git 히스토리로 콘텐츠 변경과 되돌리기를 관리합니다. 다만 GitHub 계정 침해·저장소 삭제에 독립적이지 않으므로 별도 백업은 14.1의 정책을 따릅니다.
- **DB 장애 시 빈 홈페이지**: 개념 자체가 없습니다. 배포된 HTML은 독립적으로 서비스됩니다.
- **비활성 자동 정지**: Actions는 `push` 트리거만 사용하므로 `schedule` 워크플로의 60일 자동 비활성화 대상이 아닙니다.

---

## 3. 저장소 구조

```
oreumeng-codex/
├── data/                        # ← 관리자가 편집하는 유일한 원본
│   ├── site.json
│   ├── about.json
│   ├── services.json
│   └── portfolio.json
├── images/
│   ├── oreumeng_logo.svg
│   ├── hero.webp                # 히어로 배경 (기존 전경1.jpg)
│   ├── about/main.webp
│   └── portfolio/
│       └── <caseId>/<imageId>.webp
├── templates/
│   └── index.template.html      # 현재 index.html 에서 콘텐츠만 마커로 치환
├── scripts/
│   ├── build.mjs                # 템플릿 + JSON → dist/
│   ├── migrate.mjs              # 1회용: 현재 HTML → data/*.json
│   └── lib/render.mjs
├── worker/                      # Cloudflare Worker 소스
│   ├── src/index.js
│   ├── src/auth.js
│   ├── src/github.js
│   ├── public/admin.html
│   └── wrangler.toml
├── public/                      # 빌드 시 dist/로 그대로 복사
│   ├── CNAME
│   ├── naverb2afe348002477ddda461926b9ccd669.html
│   ├── rss.xml
│   └── favicon.*
├── package.json
├── package-lock.json
├── .github/workflows/deploy.yml
├── dist/                        # 로컬/Actions 빌드 산출물, Git 커밋 금지
│   ├── index.html
│   ├── sitemap.xml
│   └── ...
└── docs/admin-cms-design.md
```

> **주의:** 빌드 도입 이후 배포용 `index.html`은 `dist/index.html`에만 생성하고 Git에 커밋하지 않습니다. 디자인을 바꿀 때는 `templates/index.template.html`을 고칩니다. 생성 파일 상단에 자동 생성 경고 주석을 넣습니다.

### 3.1 GitHub Pages 배포 방식 변경

현재는 브랜치에서 직접 서빙하고 있습니다. 이를 **GitHub Actions 배포**로 바꿔야 합니다.

`Settings → Pages → Build and deployment → Source: GitHub Actions`

`CNAME` 파일은 빌드 산출물에 반드시 포함시켜야 합니다. 누락하면 커스텀 도메인이 해제됩니다.

Pages는 `develop-codex`의 push만 빌드하도록 구성합니다. `main`을 Pages 소스나 워크플로 트리거로 지정하지 않습니다. `scripts/build.mjs`는 `public/**`, 로고, 네이버 소유확인 파일, RSS 및 필요한 정적 자산을 모두 `dist/`에 복사하고, 배포 직전에 내부 링크의 대상 파일이 전부 존재하는지 검사합니다.

---

## 4. 데이터 스키마

### 4.1 `data/site.json`

JSON-LD, 메타태그, 연락처에 사용하는 회사 기본정보의 단일 원본입니다. 사업자번호와 좌표의 공개 범위는 대표 확인 후 확정합니다.

```json
{
  "name": "오름이엔지",
  "siteUrl": "https://oreumeng.co.kr/",
  "telephone": "010-4813-8280",
  "email": "autocad@paran.com",
  "address": {
    "streetAddress": "공도읍 대신두길 145-20",
    "addressLocality": "안성시",
    "addressRegion": "경기도",
    "addressCountry": "KR"
  },
  "foundingDate": "2018-01-01",
  "experienceSinceYear": 2005,
  "taxId": "450-05-00966",
  "geo": { "latitude": 0, "longitude": 0 }
}
```

`foundingDate`는 회사 설립일이고 `experienceSinceYear`는 대표 또는 기술진의 시공 경력 시작연도입니다. 서로 다른 사실이므로 하나의 “경력” 값으로 합치지 않습니다. 좌표 `0`은 예시이며 실제 값 확인 전에는 JSON-LD에서 `geo`를 출력하지 않습니다.

### 4.2 `data/about.json`

```json
{
  "badge": "ABOUT US",
  "heading": "크린룸 시공의\n믿을 수 있는 파트너",
  "paragraphs": [
    "오름이엔지는 2018년 설립 이후, 시스템실링 및 크린부스 전문 시공업체로서 반도체, 전자, 연구시설 등 크린룸이 요구되는 다양한 산업 현장을 시공해 왔습니다.",
    "현장의 특성과 고객의 요구사항을 정확히 파악하여, 최적의 크린룸 솔루션을 제공합니다."
  ],
  "stats": [
    { "type": "static",     "value": "100+", "label": "시공 현장" },
    { "type": "sinceYear",  "value": 2005,   "suffix": "년+", "label": "시공 경력" }
  ],
  "image": "images/about/main.webp",
  "imageAlt": "오름이엔지 클린룸 시공 현장"
}
```

**`sinceYear` 타입 처리**: 현재는 브라우저 JS가 `현재연도 - 2005`를 계산합니다. 빌드 시점에 값을 계산해 HTML에 박되, 기존 3줄짜리 JS도 그대로 남겨 클라이언트에서 갱신하게 합니다. 크롤러는 빌드된 숫자를 읽고, 방문자는 항상 최신 값을 봅니다. 연말에 빌드가 없어도 숫자가 틀리지 않습니다.

`updatedAt`은 관리자 입력값으로 저장하지 않습니다. 최종 수정일과 sitemap `lastmod`는 해당 콘텐츠를 변경한 Git 커밋 시각에서 계산합니다.

### 4.3 `data/services.json`

```json
{
  "sectionTitle": "시공 분야",
  "sectionDesc": "클린환경 구축에 필요한 모든 시공 서비스를 제공합니다",
  "items": [
    {
      "id": "system-ceiling",
      "title": "시스템실링",
      "description": "완벽한 마감으로 오염을 차단하며, FFU를 설치하여 내부에 생성된 파티클을 제거하고 청정도를 유지합니다.",
      "icon": "grid",
      "order": 1,
      "published": true
    },
    { "id": "clean-booth", "title": "크린부스",    "icon": "home",      "order": 2, "published": true, "description": "..." },
    { "id": "panel-ffu",   "title": "판넬타입 FFU", "icon": "layers",    "order": 3, "published": true, "description": "..." },
    { "id": "curtain",     "title": "커튼설치",     "icon": "curtain",   "order": 4, "published": true, "description": "..." },
    { "id": "partition",   "title": "파티션",       "icon": "partition", "order": 5, "published": true, "description": "..." }
  ]
}
```

**아이콘은 이름으로만 지정합니다.** 관리자가 SVG 코드를 직접 붙여넣게 하면 XSS 경로가 되고 디자인도 깨집니다. 빌드 스크립트가 미리 정의된 아이콘 집합(`grid`, `home`, `layers`, `curtain`, `partition`, `shield`, `wind`, `tool` …)에서 꺼내 쓰며, 관리 화면에서는 드롭다운으로 미리보기와 함께 고릅니다.

### 4.4 `data/portfolio.json`

```json
{
  "sectionTitle": "시공 사례",
  "sectionDesc": "다양한 현장에서 검증된 시공 품질을 확인하세요",
  "categories": [
    { "id": "ceiling",   "label": "시스템실링", "order": 1 },
    { "id": "cleanroom", "label": "크린부스",   "order": 2 },
    { "id": "pannel",    "label": "판넬타입",   "order": 3 },
    { "id": "curtain",   "label": "커튼설치",   "order": 4 },
    { "id": "partition", "label": "파티션",     "order": 5 }
  ],
  "cases": [
    {
      "id": "01J8XQ2A3B4C5D6E7F8G9H0J1K",
      "title": "안성 반도체 부품 공장 클린룸",
      "categoryId": "ceiling",
      "description": "생산라인 확장에 따른 시스템실링 및 FFU 설치. Class 1000 기준 충족.",
      "order": 1,
      "published": true,
      "coverImageId": "img_7f3a9c",
      "images": [
        {
          "id": "img_7f3a9c",
          "file": "images/portfolio/01J8XQ2A3B4C5D6E7F8G9H0J1K/7f3a9c.webp",
          "alt": "시스템실링 천장 그리드 시공 완료 모습",
          "caption": "천장 그리드 및 FFU 설치 완료",
          "width": 1600,
          "height": 1067,
          "order": 1
        }
      ]
    }
  ]
}
```

**설계 포인트**

- **`width` / `height` 필수**: 업로드 시점에 기록해 HTML에 박습니다. 현재 사이트는 이 속성이 없어 이미지 로드 중 레이아웃이 밀리는 CLS가 발생합니다. 이 설계로 함께 해결됩니다.
- **`alt`가 사진마다 다름**: 현재는 카테고리별로 "크린부스"가 7번 반복됩니다. 사진별 설명이 들어가면 이미지 검색 유입이 개선됩니다. 관리 화면에서 alt는 **필수 입력**으로 강제합니다.
- **`id`는 ULID**: 시간순 정렬이 가능하고 파일명 충돌이 없습니다.
- **이미지 파일이 현장 폴더 아래 위치**: 현장을 삭제하면 폴더째 지우면 되므로 고아 파일이 남지 않습니다.
- **`coverImageId`**: 목록 카드에 쓸 대표 사진. 지정하지 않으면 `order`가 가장 앞선 사진을 사용합니다.
- 생성·수정 시각은 관리자가 보내지 않습니다. Worker가 커밋 메시지에 작성자 이메일과 작업 종류를 기록하고, 화면 표시에는 Git 커밋 시각을 사용합니다.
- 카테고리는 이번 버전에서 **고정 목록**입니다. 관리자 UI에서 추가·이름 변경·삭제하지 않습니다. 기존 URL 호환을 위해 `pannel` ID는 1.1에서 유지하며, 표시명만 “판넬타입”으로 사용합니다.

---

## 5. 인증 및 보안

### 5.1 1차 방어 — Cloudflare Access

Workers 대시보드에서 해당 Worker에 **Enable Cloudflare Access**를 켭니다. 도메인을 Cloudflare에 온보딩할 필요가 없습니다.

- 인증 방식: **One-time PIN** (허용된 이메일로 6자리 인증번호 발송)
- 허용 이메일: 대표 이메일 + 담당 개발자 이메일
- 세션 유효기간: 24시간 권장
- 무료 한도: 50명

비밀번호를 저장하지도, 해싱하지도, 재설정 기능을 만들지도 않습니다. 로그인 시도 제한도 Cloudflare가 처리합니다.

### 5.2 2차 방어 — Worker 내부 JWT 검증 (필수)

**이 단계를 생략하지 마십시오.** Access는 요청 경로 앞단에 놓인 장치이고, Worker 자신은 "앞에 Access가 있겠지"라고 가정할 뿐 확인하지 않습니다. 이 Worker는 **저장소 쓰기 권한이 있는 GitHub 토큰**을 보유하므로, 라우트 설정 실수나 향후 커스텀 도메인 추가 시 인증 없이 도달하면 누구나 홈페이지에 커밋할 수 있게 됩니다.

Cloudflare 공식 문서도 `aud` 태그와 JWKS URL을 이용한 검증을 권장합니다.

```js
// worker/src/auth.js
import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks;

export async function verifyAccess(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, reason: 'no-token' };

  try {
    jwks ??= createRemoteJWKSet(
      new URL('/cdn-cgi/access/certs', env.ACCESS_ISSUER)
    );
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.ACCESS_ISSUER,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256']
    });

    const email = String(payload.email || '').toLowerCase();
    const allowed = env.ALLOWED_EMAILS
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean);
    if (!allowed.includes(email)) return { ok: false, reason: 'not-allowed' };

    return { ok: true, email };
  } catch {
    return { ok: false, reason: 'invalid-token' };
  }
}
```

`jwtVerify`가 서명, `iss`, `aud`, `exp`, `nbf`, 허용 알고리즘을 검증하고 원격 JWKS 캐시 및 키 교체를 처리합니다. 모든 라우트 진입점에서 이 함수를 먼저 호출하고, 실패 시 세부 내부 오류를 노출하지 않는 `401`을 반환합니다.

변경 API는 JWT 외에도 다음을 검사합니다.

- `Origin`이 정확히 관리자 Worker origin인지 확인
- JSON API는 `Content-Type: application/json`만 수락. `/api/images`만 boundary가 있는 `multipart/form-data`를 허용하고 그 안의 `file` part는 `image/webp`만 수락
- CORS는 기본적으로 열지 않으며 관리자 UI와 API를 같은 origin에서 제공
- 요청 본문 크기 제한과 경로별 간단한 rate limit 적용
- 관리자 미리보기는 `innerHTML`에 사용자 문자열을 직접 넣지 않고 `textContent` 또는 안전한 DOM API 사용

### 5.3 GitHub 토큰

- **Fine-grained PAT** 사용
- 대상 저장소: `oreumeng-codex` **하나만**
- 권한: `Contents: Read and write`, `Actions: Read`. 쓰기 권한은 Contents에만 부여
- 만료: 1년. 캘린더에 갱신 알림 등록
- 저장 위치: `wrangler secret put GITHUB_TOKEN` — Worker Secret에만 존재하며 관리 화면 HTML/JS에는 절대 포함하지 않습니다

### 5.4 Worker Secret / 환경변수 목록

| 이름 | 종류 | 용도 |
|---|---|---|
| `GITHUB_TOKEN` | Secret | 저장소 커밋 |
| `UPLOAD_RECEIPT_SECRET` | Secret | 스테이징 이미지 영수증 HMAC 서명 |
| `ACCESS_ISSUER` | 변수 | `https://<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | 변수 | Access 애플리케이션 AUD 태그 |
| `ALLOWED_EMAILS` | 변수 | 쉼표 구분 허용 이메일 |
| `GH_OWNER` / `GH_REPO` / `GH_BRANCH` | 변수 | 대상 저장소 및 브랜치 |

### 5.5 업로드 검증 규칙

| 항목 | 규칙 |
|---|---|
| MIME 허용 | Worker 업로드는 `image/webp`만 허용. JPEG/PNG는 브라우저에서 WebP로 변환 후 전송 |
| 매직바이트 검사 | 확장자·MIME 헤더를 신뢰하지 않고 실제 바이트 시그니처 확인 |
| 최대 용량 | 2MB / 장 |
| 최대 해상도 | 긴 변 1920px. Worker가 WebP 헤더에서 실제 크기를 읽어 검증 |
| 1회 업로드 장수 | 20장 |
| 파일명 | **클라이언트 파일명을 절대 사용하지 않음.** 서버에서 ULID 기반 생성 → 경로 traversal 및 한글 파일명 문제 원천 차단 |
| 현장당 사진 수 | 50장 (저장소 비대화 방지) |

HEIC/HEIF는 브라우저별 디코딩 차이가 크므로 1.1의 공식 지원 형식에서 제외합니다. 선택 시 “기기에서 호환성 높은 형식으로 내보낸 뒤 업로드해 주세요”라고 안내합니다. 실제 iPhone 사진 선택기가 JPEG로 변환해 전달하는지는 지원 대상 iOS 기기에서 별도로 검증합니다.

---

## 6. Worker API 명세

Base: `https://oreumeng-admin.<계정>.workers.dev`
모든 엔드포인트는 5.2의 JWT 검증을 통과해야 합니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/` | 관리자 UI (단일 HTML, 인라인 CSS/JS) |
| `GET` | `/api/content` | 읽기 전용 `site`와 편집용 `about/services/portfolio` JSON + 각 파일 blob SHA + 최신 커밋 SHA |
| `PUT` | `/api/content` | 변경된 JSON 저장. 요청에 `baseCommit` 포함 |
| `POST` | `/api/images` | WebP 이미지 업로드(스테이징). blob SHA와 서명된 업로드 영수증 반환 |
| `GET` | `/api/status?commit=<sha>` | 해당 CMS 커밋과 연결된 Actions 실행·Pages 배포 상태 조회 |
| `POST` | `/api/revert` | 지정한 CMS 커밋의 허용 경로 변경만 역적용 |

### 6.1 API 요청 계약

관리 화면은 신규 현장 편집을 시작할 때 브라우저에서 `caseId` ULID를 먼저 생성합니다. 아직 저장되지 않은 현장도 같은 `caseId`로 사진을 스테이징할 수 있습니다. `POST /api/images`는 `multipart/form-data`로 다음 필드를 받습니다.

- `targetKind`: `about` 또는 `portfolio`
- `caseId`: `portfolio`일 때 필수인 ULID, `about`일 때는 금지
- `file`: 브라우저가 변환한 WebP 바이너리

Worker는 `targetKind`와 `caseId` 형식을 검증하고 클라이언트 파일명은 사용하지 않습니다. `imageId` ULID와 최종 경로를 서버에서 만들고, WebP 매직바이트·크기·해상도를 검사한 뒤 Git blob을 생성합니다.

- `portfolio`: `images/portfolio/<caseId>/<imageId>.webp`
- `about`: `images/about/<imageId>.webp`

응답은 다음 값을 포함합니다.

```json
{
  "uploadId": "01...",
  "imageId": "img_01...",
  "targetKind": "portfolio",
  "caseId": "01...",
  "blobSha": "abc...",
  "path": "images/portfolio/<caseId>/img_01....webp",
  "width": 1600,
  "height": 1067,
  "expiresAt": "2026-07-26T10:00:00Z",
  "receipt": "<Worker HMAC 서명>"
}
```

`uploadId`는 스테이징 요청 식별자이고 `imageId`는 `portfolio.json`의 `images[].id` 및 파일명에 쓰는 영구 식별자입니다. `receipt`는 `uploadId`, `imageId`, `targetKind`, `caseId`, blob SHA, 서버 생성 경로, 크기, 업로드한 관리자 이메일, 만료시각을 Worker Secret의 HMAC 키로 묶습니다. `PUT /api/content`는 영수증의 `imageId/path/caseId`가 새 JSON과 정확히 일치하고 유효기간이 남은 신규 이미지만 tree에 연결합니다. 사용하지 않은 blob은 어떤 ref에도 연결되지 않으며 사이트에 노출되지 않습니다.

`PUT /api/content` 요청은 다음을 포함합니다.

```json
{
  "baseCommit": "<GET /api/content에서 받은 HEAD SHA>",
  "idempotencyKey": "<UUID>",
  "content": {
    "about": {},
    "services": {},
    "portfolio": {}
  },
  "stagedImages": [{ "receipt": "..." }],
  "deletedImageIds": ["img_..."]
}
```

Worker는 브라우저 입력을 그대로 tree 경로로 사용하지 않습니다. 기존 JSON과 새 JSON을 비교해 허용된 이미지 경로의 추가·삭제 목록을 직접 계산합니다. 편집 가능한 JSON은 `data/about.json`, `data/services.json`, `data/portfolio.json`으로 제한하며 `data/site.json`은 1.1 관리자 화면에서 읽기 전용입니다. 이미지도 `images/about/**`, `images/portfolio/**` 밖의 경로는 수정할 수 없습니다.

커밋 메시지에 `[cms][request:<idempotencyKey>]`를 기록합니다. 재시도 시 현재 HEAD가 동일한 요청 키를 가진 성공 커밋이면 새 커밋을 만들지 않고 기존 commit SHA를 반환합니다. 다른 커밋이면 일반 충돌로 처리합니다.

### 6.2 원자적 저장 — Git Data API를 쓰는 이유

Contents API(`PUT /repos/.../contents/{path}`)는 **파일 하나당 커밋 하나**입니다. JSON과 이미지 5장을 저장하면 커밋 6개가 생기고, 중간에 실패하면 반쪽 상태가 남으며, Actions가 6번 도는 낭비도 발생합니다.

**Git Data API**를 쓰면 여러 파일을 단일 커밋으로 묶을 수 있습니다.

```
1. POST /git/blobs            × N   ← 이미지 및 JSON 각각 (업로드 단계에서 미리 수행)
2. GET  /git/ref/heads/<브랜치>      ← 현재 HEAD
3. POST /git/trees                  ← base_tree + 변경 파일 목록
4. POST /git/commits                ← tree + parent
5. PATCH /git/refs/heads/<브랜치>    ← ref 이동 (이 시점에 원자적으로 반영)
```

5번이 성공해야만 변경이 브랜치에 보입니다. 1~4번 중 실패하면 ref에는 아무것도 반영되지 않고 만들어진 blob은 사이트에 노출되지 않습니다. GitHub에는 참조되지 않은 blob을 즉시 삭제하는 API가 없으므로 정리 시점을 보장하지 않으며, 대량의 저장 취소가 반복되면 저장소 상태를 점검합니다.

### 6.3 동시 편집 방어

관리자가 1명이라도 브라우저 탭 두 개를 열어두는 상황은 발생합니다. 저장 시 다음 CAS 절차를 고정합니다.

1. `PUT /api/content`의 `baseCommit`을 받습니다.
2. `develop-codex`의 현재 HEAD를 조회합니다.
3. `현재 HEAD !== baseCommit`이면 blob/tree/commit을 만들기 전에 `409 Conflict`를 반환합니다.
4. 새 tree의 `base_tree`와 새 commit의 parent를 모두 `baseCommit`으로 고정합니다.
5. `PATCH /git/refs/heads/develop-codex`를 `force: false`로 호출합니다.
6. 3번 이후 HEAD가 움직였다면 5번이 non-fast-forward로 거절되므로 `409`를 반환합니다.

관리 화면은 "다른 곳에서 먼저 저장되었습니다. 새로고침 후 다시 시도하세요"를 띄우고 사용자 입력을 잃지 않도록 임시 보관합니다.

### 6.4 되돌리기

`POST /api/revert`는 전체 부모 트리를 복사하지 않습니다. 1.1에서는 임의의 과거 버전이 아니라 **가장 최근 CMS 커밋 한 건만** 되돌릴 수 있습니다. 요청은 `targetCommit`과 현재 `baseCommit`을 포함하며, 다음 규칙을 모두 만족해야 합니다.

- `targetCommit`의 메시지와 메타데이터가 Worker가 생성한 `[cms]` 커밋임을 확인
- `targetCommit`이 현재 `develop-codex` HEAD의 조상이고, HEAD에서 역순으로 찾은 가장 최근 `[cms]` 커밋인지 확인
- 해당 커밋에서 변경된 `data/about.json`, `data/services.json`, `data/portfolio.json`, `images/about/**`, `images/portfolio/**`만 역적용
- 템플릿, 스크립트, 워크플로, 문서 등 코드 경로는 절대 변경하지 않음
- 현재 HEAD가 `baseCommit`과 다르면 `409`
- 각 대상 경로의 현재 blob SHA가 `targetCommit` 적용 직후의 blob SHA와 같은지 검사. 이후 변경된 경로가 하나라도 있으면 전체 revert를 `409`로 거부
- merge commit은 CMS 되돌리기 대상으로 인정하지 않음
- 되돌리기도 `[cms][revert]` 새 커밋으로 기록하고 `develop-codex`에 fast-forward
- 적용 전에 복구·삭제될 파일 목록을 관리자에게 표시하고 확인받음

이 방식은 개발 코드 커밋이 사이에 있어도 코드와 워크플로를 과거 상태로 되돌리지 않습니다.

---

## 7. 이미지 파이프라인

### 7.1 변환은 브라우저에서 수행합니다

Workers 무료 플랜의 CPU 제한 안에서 대형 사진을 안정적으로 재인코딩하기 어렵기 때문에 변환은 브라우저에서 처리합니다. Cloudflare Images에는 무료 URL 변환 기능도 있지만, 이번 설계는 저장·전달 서비스 추가 없이 Git 원본을 만들기 위해 사용하지 않습니다.

```js
// 관리 화면 업로드 처리
async function optimize(file, maxEdge = 1920, quality = 0.82) {
  // imageOrientation: 'from-image' 가 EXIF 회전 정보를 반영해 준다.
  // 현장 사진은 휴대폰 세로 촬영이 많아 이 옵션이 없으면 눕거나 뒤집힌다.
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width  * scale);
  const h = Math.round(bmp.height * scale);

  // 실제 구현은 OffscreenCanvas 미지원 시 HTMLCanvasElement로 폴백한다.
  const canvas = supportsOffscreenCanvas()
    ? new OffscreenCanvas(w, h)
    : createHtmlCanvas(w, h);
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close();

  const blob = await canvasToWebp(canvas, quality);
  if (!blob || blob.type !== 'image/webp') {
    throw new Error('이 브라우저에서는 WebP 변환을 지원하지 않습니다.');
  }
  return { blob, width: w, height: h };
}
```

`canvasToWebp`는 `OffscreenCanvas.convertToBlob()`과 `HTMLCanvasElement.toBlob()`을 모두 지원하는 래퍼입니다. `createImageBitmap` 자체가 없거나 HEIC/HEIF를 해석하지 못하면 사용자에게 지원 형식 안내를 표시합니다. EXIF 방향 처리는 브라우저마다 다를 수 있으므로 코드 가정만으로 완료 처리하지 않고 대상 iOS/Android 실기기에서 회전 결과를 검증합니다. 저사양 기기 대비로 **한 번에 1장씩 순차 처리**하고 진행률을 표시합니다.

### 7.2 저장소에는 최적화본 한 벌만

원본을 커밋하면 Git 히스토리에 대용량 바이너리가 누적됩니다. 저장소에는 **긴 변 1920px WebP 한 벌만** 둡니다. 썸네일 같은 파생본은 빌드 단계에서 `sharp`로 생성해 **배포 산출물에만 포함하고 커밋하지 않습니다.**

목표 용량은 사진 1장당 약 150~250KB지만 장면 복잡도에 따라 달라질 수 있습니다. 현재 저장소의 packed Git 데이터가 이미 약 57MB이므로 연 1회가 아니라 분기별로 저장소 크기와 이미지 증가율을 확인합니다.

### 7.3 히어로 이미지

현재 `전경1.jpg`가 CSS `background`로 들어가 있어 브라우저가 늦게 발견하고, LCP가 지연됩니다. 빌드 시 `<link rel="preload" as="image">`를 자동 삽입합니다.

---

## 8. 빌드 파이프라인

### 8.1 템플릿 방식

기존 `index.html`을 `templates/index.template.html`로 옮기고, 콘텐츠 영역만 마커로 바꿉니다. 디자인·CSS·JS는 그대로 두므로 초기 변경 범위가 작고 시각적 회귀 위험이 낮습니다.

```html
<!-- @HEAD_META -->
...
<!-- @ABOUT -->
...
<!-- @SERVICES -->
...
<!-- @PORTFOLIO -->
```

`scripts/build.mjs`가 각 마커를 렌더링 결과로 치환합니다. 모든 사용자 입력은 HTML 이스케이프를 거칩니다.

### 8.2 빌드가 함께 해결하는 SEO 항목

관리자 기능과 무관하게 현재 누락된 항목들을 빌드 단계에서 자동 생성합니다. 사람이 매번 챙길 필요가 없어집니다.

| 산출물 | 내용 |
|---|---|
| JSON-LD | `LocalBusiness` — `site.json`의 상호·주소·전화·사업자번호·검증된 좌표. 검색엔진의 사업체 정보 이해를 돕지만 순위나 리치 결과를 보장하지 않음 |
| `og:image` | 대표 시공 사진 자동 지정 → 카톡·문자 공유 시 썸네일 표시 |
| `canonical`, `og:url` | `https://oreumeng.co.kr/` |
| `sitemap.xml` | `lastmod`를 실제 콘텐츠를 변경한 Git 커밋 시각으로 갱신 |
| `robots.txt` | 신규 생성 |
| favicon | 로고 기반 생성 |
| `meta description` | 회사 설립연도와 기술 경력을 구분하고 `site.json`·`about.json`에서 생성 |
| 이미지 `width`/`height` | `portfolio.json`에 기록된 값 삽입 → CLS 제거 |
| 폰트 | 실제 사용하는 굵기만 로드 (현재 300/400/500/700/900 전부 로드 중) |

### 8.3 워크플로

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [develop-codex]
    paths:
      - 'data/**'
      - 'images/**'
      - 'public/**'
      - 'templates/**'
      - 'scripts/**'
      - 'package.json'
      - 'package-lock.json'
      - '.github/workflows/deploy.yml'

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    if: github.ref == 'refs/heads/develop-codex'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/configure-pages@v5
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test
      - run: node scripts/build.mjs          # 검증·자산 복사·링크 검사
      - uses: actions/upload-pages-artifact@v4
        with: { path: dist }

  deploy:
    if: github.ref == 'refs/heads/develop-codex'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

`schedule`과 `workflow_dispatch` 트리거를 쓰지 않습니다. `push` 필터와 job의 `if` 조건을 이중 적용하고, GitHub Pages의 `github-pages` 환경에도 `develop-codex`만 허용하는 배포 브랜치 보호 규칙을 설정합니다. `main`을 어떤 배포 경로에도 연결하지 않습니다.

### 8.4 빌드 실패 시 동작

Worker는 커밋 전에 동일한 JSON Schema로 1차 검증하고, `build.mjs`는 렌더링 전에 다시 검증합니다. 필수 필드 누락, ID·order 중복, 문자열 길이 초과, 존재하지 않는 이미지·대표 이미지 참조, 잘못된 `categoryId`, 허용 경로 밖의 이미지 URL, 공개 현장의 필수값 누락 등이 있으면 저장 또는 빌드를 중단합니다.

이때 배포가 일어나지 않으므로 **기존 사이트가 그대로 유지됩니다.** 안전한 기본값이지만, 관리자 입장에서는 "저장했는데 왜 안 바뀌지?"만 겪게 됩니다. 따라서:

- 저장소 Settings에서 워크플로 실패 알림 이메일을 켭니다
- 관리 화면에 저장 결과의 commit SHA를 보관하고 `GET /api/status?commit=<sha>`로 **그 커밋에 대응하는** Actions workflow 상태를 표시합니다 (진행 중 / 반영 완료 / 실패). 이 워크플로의 deploy job이 `actions/deploy-pages`까지 포함하므로 deploy job 성공을 Pages 반영 완료로 간주합니다. 별도 GitHub Pages API는 조회하지 않으며 PAT의 `Actions: Read`만 사용합니다.

관리자 안내 시간은 “일반적으로 수분 내 반영, 경우에 따라 최대 10분”으로 표시합니다. 최신 실행 하나만 조회하지 않고 저장 commit SHA와 workflow run의 `head_sha`가 일치하는지 확인합니다.

---

## 9. 관리자 화면 설계

단일 HTML 파일. 좌측 탭 3개, 모바일에서는 상단 탭으로 전환됩니다.

### 9.1 회사소개

- 제목 / 본문 문단(추가·삭제 가능) / 대표 이미지 교체
- 통계 2개 (숫자·라벨 편집)
- **미리보기**: 실제 홈페이지 CSS를 적용한 영역에 실시간 렌더링
- 최종 수정일 표시 (Git 커밋 시각)

### 9.2 시공분야

- 카드 목록. 각 항목: 제목 / 설명 / 아이콘(드롭다운, 미리보기 포함) / 공개 여부
- 순서 변경: 위·아래 버튼 (드래그는 모바일에서 다루기 어려움)
- 추가 / 수정 / 삭제 (삭제 시 확인 대화상자)

### 9.3 시공사례

**현장 목록 화면**
- 카드 그리드 (대표 사진 + 현장명 + 카테고리 + 사진 수 + 공개 여부)
- 카테고리 필터 / 순서 변경 / 신규 현장 등록

**현장 편집 화면**
- 현장명, 카테고리, 시공 설명, 시공 시기(연-월), 공개 여부
- 사진 영역
  - 드래그&드롭 또는 파일 선택으로 다중 업로드
  - 업로드 전 미리보기 + 변환 진행률
  - 각 사진: 대표 지정(라디오), 순서 변경, **대체 텍스트(필수)**, 설명, 삭제
- 저장 버튼 → 원자적 커밋 → "반영 중(약 1~2분)" 상태 표시

### 9.4 공통

- 저장하지 않고 벗어나려 하면 경고
- 모든 삭제에 확인 대화상자
- 모바일 대응 (현장에서 휴대폰으로 사진 업로드하는 시나리오가 실제 주 사용처)
- 우측 상단에 배포 상태 배지

---

## 10. 기존 콘텐츠 이관

`scripts/migrate.mjs` (1회 실행 후 폐기)

1. 현재 `index.html` 파싱 → About 문단, Services 5개, Portfolio 20장 추출
2. 이미지 20장 + `AboutUs/main.jpg` + `전경1.jpg` → WebP 변환(`sharp`), `width`/`height` 기록
3. `data/*.json` 생성

**현장 구조 관련 주의사항**: 현재 사진들은 현장 단위가 아니라 **카테고리 단위**로만 묶여 있습니다. 어느 사진이 같은 현장인지 알 수 있는 정보가 HTML에 없습니다.

따라서 이관 시에는 **카테고리당 현장 1개**를 임시로 만듭니다.

| 임시 현장명 | 카테고리 | 사진 |
|---|---|---|
| 시스템실링 시공사례 | ceiling | 3장 |
| 크린부스 시공사례 | cleanroom | 7장 |
| 판넬타입 시공사례 | pannel | 4장 |
| 커튼설치 시공사례 | curtain | 3장 |
| 파티션 시공사례 | partition | 3장 |

이관 직후 공개 홈페이지는 현재와 동일하게 **사진 20장을 각각 카드로 표시**합니다. 내부 데이터만 카테고리당 임시 현장 1개로 묶고, 어느 사진 카드를 클릭해도 해당 임시 현장의 갤러리가 열립니다. 이후 대표가 관리 화면에서 실제 현장명("○○반도체 2공장")으로 쪼개더라도 공개 화면은 현장별 사진 타일 방식을 유지합니다. 향후 “현장당 대표 카드 1개” 방식으로 바꾸려면 별도 디자인 변경으로 승인받습니다.

마이그레이션 단계에서 기존 카테고리명과 순번을 이용해 사진별 초기 `alt`를 자동 생성합니다(예: “크린부스 시공 사례 1”). 스키마의 필수 조건을 만족시킨 뒤, 관리 화면에서 더 구체적인 현장 설명으로 개선하도록 “보완 필요” 표시를 제공합니다.

이관 결과는 배포 전에 로컬 빌드로 **현재 사이트와 시각적으로 동일한지 확인**한 뒤 커밋합니다.

---

## 11. 향후 확장: 문의 폼

이번 범위에서 제외했지만, 넣게 될 경우를 기록해 둡니다.

**Git 방식으로는 불가능합니다.** 방문자가 데이터를 쓰는 기능이기 때문입니다(공개 페이지에 쓰기 자격증명을 둘 수 없고, 스팸이 저장소 히스토리에 영구히 남습니다).

추가 시 구성:

- 공개 페이지의 폼 → **별도 Worker** 엔드포인트(Access 미적용, Turnstile로 봇 차단)
- 저장: Cloudflare D1 (문의 건수는 하루 수 건 수준이라 무료 한도에 여유가 큼)
- 알림: 접수 즉시 대표 이메일로 전송 (MailChannels 또는 Resend)
- 조회: 기존 관리 화면에 탭 하나 추가 (Access 적용)

**중요**: 이때도 공개 홈페이지는 정적 HTML을 유지합니다. 폼은 제출(POST)만 API를 쓰고, 페이지 렌더링에는 관여하지 않으므로 SEO에 영향이 없습니다.

---

## 12. 구현 순서

| 단계 | 작업 | 산출물 | 비고 |
|---|---|---|---|
| 0 | 사전 확인 | — | 대표 사용 환경에서 `*.workers.dev` 접속 테스트. 원격 `develop-codex` 존재 여부 확인 후 없으면 이 브랜치만 push. `main`은 변경하지 않음 |
| 1 | 템플릿 + 빌드 스크립트 | `templates/`, `scripts/build.mjs` | **콘텐츠는 아직 하드코딩.** 빌드 결과가 현재 `index.html`과 동일한지 먼저 확인 |
| 2 | Actions 배포 전환 | `deploy.yml` | `develop-codex` 전용 Pages Actions. CNAME·네이버 확인 파일·RSS 포함 확인. `main` 배포 금지 |
| 3 | 데이터 이관 | `data/*.json`, WebP 이미지 | `migrate.mjs` 실행 후 시각적 동일성 검증 |
| 4 | SEO 산출물 추가 | JSON-LD, og:image, sitemap, robots, favicon | 이 시점에 이미 눈에 보이는 효과 발생 |
| 5 | Worker 골격 + Access | `worker/` | JWT 검증 먼저. 인증 없이 접근되는지 반드시 확인 |
| 6 | 콘텐츠 조회·저장 API | `/api/content` | Git Data API 단일 커밋, 409 충돌 처리 |
| 7 | 이미지 업로드 | `/api/images` | 브라우저 변환 + 검증 |
| 8 | 관리 화면 3개 탭 | `admin.html` | 미리보기·순서변경·삭제 확인 |
| 9 | 되돌리기 + 배포 상태 | `/api/revert`, `/api/status` | |
| 10 | 통합 테스트 | 13장 체크리스트 | 모바일 실기기 포함 |

**1~4단계만 완료해도 독립적인 가치가 있습니다.** SEO가 개선되고 이미지가 최적화되며, 관리자 기능 없이도 사이트가 더 나아집니다. 5단계 이후가 지연되어도 손해가 없습니다.

---

## 13. 검증 체크리스트

### 보안

- [ ] Access 없이 Worker URL 직접 호출 시 401
- [ ] 만료된 JWT로 호출 시 401
- [ ] 다른 Access 앱에서 발급된 JWT(`aud` 불일치)로 호출 시 401
- [ ] 허용 목록에 없는 이메일로 로그인 시 차단
- [ ] 관리 화면 HTML/JS 소스에 GitHub 토큰이 노출되지 않음
- [ ] 이미지가 아닌 파일(예: `.html`, `.js`) 업로드 시 거부
- [ ] 파일명에 `../` 포함 시도가 무해함 (서버 생성 파일명 사용 확인)
- [ ] PAT 대상이 해당 저장소 하나이며 `Contents: Read and write`, `Actions: Read` 외 권한이 없음
- [ ] JWT의 잘못된 Base64url·`alg`·`iss`·`nbf`·`aud`, JWKS 장애·키 교체가 모두 안전하게 401 처리됨
- [ ] 잘못된 `Origin`, 비 JSON 요청, 허용하지 않은 메서드, 과대 요청 본문 거부
- [ ] 관리자 미리보기와 빌드 결과에서 HTML·URL 기반 저장형 XSS가 실행되지 않음
- [ ] 존재하지 않는 blob SHA, 만료·변조된 업로드 영수증, 허용 경로 밖 삭제 요청 거부

### 기능

- [ ] 현장 등록 → 사진 5장 업로드 → 저장 → 1~2분 내 홈페이지 반영
- [ ] 대표 사진 변경이 목록 카드에 반영
- [ ] 사진 순서 변경이 갤러리에 반영
- [ ] 비공개 전환 시 홈페이지에서 사라짐
- [ ] 현장 삭제 시 JSON과 이미지 폴더가 **같은 커밋**에서 제거됨
- [ ] 탭 2개에서 동시 저장 시 나중 요청이 409로 거부됨
- [ ] HEAD 확인 직후·tree 생성 직후·ref 갱신 직전에 HEAD가 바뀌는 race 테스트에서 변경 유실 없음
- [ ] 같은 `idempotencyKey` 재전송 시 중복 커밋이 생기지 않음
- [ ] 되돌리기로 직전 상태 복구
- [ ] 되돌리기가 `[cms]` 콘텐츠 경로만 바꾸고 개발 코드·워크플로를 건드리지 않음
- [ ] 빌드 실패 시 기존 사이트가 유지되고 실패 알림 수신
- [ ] 저장 commit SHA와 관리 화면에 표시된 Actions 실행의 `head_sha`가 일치
- [ ] GitHub API 401/403/409/422/429/5xx 및 타임아웃 메시지가 복구 방법과 함께 표시
- [ ] 업로드 후 저장 취소·탭 종료 시 스테이징 blob이 사이트에 노출되지 않음
- [ ] 대표 사진 삭제, 마지막 사진 삭제, About 이미지 교체의 무결성 유지

### 품질

- [ ] 배포된 HTML을 JS 끄고 열었을 때 모든 콘텐츠가 보임 **(SEO 핵심)**
- [ ] `view-source:`에 About·Services·Portfolio 텍스트가 그대로 존재
- [ ] JSON-LD가 [리치 결과 테스트](https://search.google.com/test/rich-results)를 통과
- [ ] Lighthouse: LCP 2.5초 미만, CLS 0.1 미만
- [ ] 카톡으로 링크 공유 시 썸네일과 설명이 표시됨
- [ ] 네이버 서치어드바이저에서 수집 요청 후 정상 수집 확인
- [ ] EXIF 세로 사진 업로드 시 회전이 정상
- [ ] 휴대폰(iOS/Android)에서 사진 업로드·저장 정상 동작
- [ ] HEIC/HEIF 선택 시 지원 안내가 명확하고 앱이 중단되지 않음
- [ ] 동일 입력을 두 번 빌드했을 때 빌드 시각 때문에 불필요한 산출물 차이가 생기지 않음
- [ ] `dist/`에 CNAME·네이버 확인 파일·RSS·robots·favicon·sitemap·모든 참조 이미지가 포함됨
- [ ] 마이그레이션 전후 20개 사진 타일, 텍스트, 링크, 필터, 라이트박스 동작 비교
- [ ] `main`에 CMS 커밋·병합·Pages 배포가 발생하지 않음

---

## 14. 위험 요소와 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| `*.workers.dev`가 특정 망에서 차단 | 관리자가 접속 불가 | 착수 전 0단계에서 실사용 환경 테스트. 문제 시 저가 도메인 1개를 Cloudflare에 올려 서브도메인 부여 |
| GitHub PAT 만료 | 저장 실패 | 만료 1년 설정 + 캘린더 알림. 관리 화면에 만료 임박 경고 표시 |
| 빌드 스크립트 버그로 사이트 깨짐 | 홈페이지 손상 | 빌드 검증 단계에서 중단 → 배포 안 됨. 그래도 깨지면 `git revert` |
| 저장소 용량 증가 | 장기적 클론 속도 저하 | 최적화본만 커밋. 현재 packed 약 57MB를 기준으로 분기별 점검. 필요 시 R2로 이전 |
| GitHub Pages / Actions 장애 | 배포 지연 | 이미 배포된 사이트는 정상 서비스. 관리 작업만 지연 |
| Cloudflare 무료 플랜 SLA 없음 | 관리 도구 접속 불가 | 홈페이지는 영향 없음. 급하면 로컬에서 `data/*.json` 직접 수정 후 push (백도어 경로 확보) |
| 대표가 alt 텍스트를 대충 입력 | SEO 효과 반감 | 필수 입력 + 예시 문구 표시(예: "안성 ○○공장 크린부스 내부 시공 모습") |

### 14.1 백업 정책

Git 히스토리는 되돌리기 수단이지만 GitHub와 독립된 백업은 아닙니다. 최소 월 1회 다음을 수행합니다.

- `develop-codex` 전체 mirror 또는 bundle을 회사 관리 PC·백업 드라이브에 저장
- GitHub 계정 2단계 인증과 복구 코드 별도 보관
- 백업에서 저장소와 Pages 빌드를 복원하는 절차를 반기 1회 확인

백업 자동화가 `schedule` 워크플로에 의존하지 않도록 회사의 기존 백업 절차 또는 로컬 작업으로 관리합니다.

---

## 15. 요약

- **DNS·이메일 설정은 건드리지 않습니다.** 가비아 그대로.
- **방문자가 받는 것은 지금과 같은 정적 HTML입니다.** CMS 런타임 API 의존과 초기 빈 HTML이 없습니다. SEO는 배포 전후 수집·성능 검증으로 확인합니다.
- **관리자만 Cloudflare를 거칩니다.** Access + Worker 내 JWT 검증, 두 겹.
- **데이터는 Git입니다.** 허용 경로의 콘텐츠·이미지를 단일 커밋으로 저장하고, 별도 독립 백업을 유지합니다.
- **관리 계층은 Worker 1개 + Access 1개입니다.** 공개 사이트는 기존 GitHub Pages와 Actions를 사용하며 현재 예상 월 고정비는 0원입니다.
- **브랜치는 `develop-codex` 하나만 사용합니다.** `main`에는 병합·커밋·배포하지 않습니다.
- **1~4단계만으로도 SEO와 성능이 개선됩니다.** 나머지가 늦어져도 손해가 없습니다.
