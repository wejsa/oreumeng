const state = {
  content: null,
  baseCommit: null,
  latestCmsCommit: null,
  stagedImages: [],
  previewUrls: new Map(),
  dirty: false,
  busy: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const serviceIcons = {
  grid: {
    label: "클린룸 격자",
    body: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
  },
  home: {
    label: "건물",
    body: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  },
  layers: {
    label: "패널",
    body: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>',
  },
  curtain: {
    label: "커튼",
    body: '<path d="M4 3h16M4 3v18M20 3v18"/><path d="M4 8c4 0 4 4 8 4s4-4 8-4M4 14c4 0 4 4 8 4s4-4 8-4"/>',
  },
  partition: {
    label: "파티션",
    body: '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/>',
  },
};

const serviceIconSvg = (name) => {
  const icon = serviceIcons[name] || serviceIcons.grid;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.body}</svg>`;
};

const getPath = (object, path) =>
  path.split(".").reduce((value, key) => value?.[key], object);

const setPath = (object, path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((current, key) => current[key], object);
  target[last] = value;
};

const showNotice = (message, error = false) => {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.toggle("error", error);
  notice.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => {
    notice.hidden = true;
  }, error ? 9000 : 5000);
};

const showResultDialog = (title, message, error = false) => {
  const dialog = $("#result-dialog");
  dialog.classList.toggle("success", !error);
  dialog.classList.toggle("error", error);
  $("#result-title").textContent = title;
  $("#result-message").textContent = message;
  if (dialog.open) dialog.close();
  dialog.showModal();
};

const errorMessage = (error) => {
  if (error?.payload?.message) return error.payload.message;
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return "네트워크 연결을 확인해 주세요.";
  }
  return error?.message || "처리 중 오류가 발생했습니다.";
};

const api = async (path, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD"].includes(options.method || "GET")) {
    headers.set("X-CMS-Request", "1");
  }
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `요청 실패 (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

const markDirty = () => {
  state.dirty = true;
  $("#dirty-indicator").textContent = "저장하지 않은 변경 있음";
  $("#dirty-indicator").classList.add("dirty");
  $("#save-button").disabled = false;
};

const markClean = () => {
  state.dirty = false;
  $("#dirty-indicator").textContent = "저장된 상태";
  $("#dirty-indicator").classList.remove("dirty");
  $("#save-button").disabled = true;
};

const setBusy = (busy, label = "변경사항 저장") => {
  state.busy = busy;
  $("#save-button").textContent = busy ? label : "변경사항 저장";
  $("#save-button").disabled = busy || !state.dirty;
  $("#revert-button").disabled = busy || !state.latestCmsCommit;
};

const normalizeOrders = (items) => {
  items.forEach((item, index) => {
    item.order = index + 1;
  });
};

const imageUrl = (path) => {
  if (state.previewUrls.has(path)) return state.previewUrls.get(path);
  const params = new URLSearchParams({ path });
  if (state.baseCommit) params.set("ref", state.baseCommit);
  return `/api/image?${params}`;
};

const bindStaticFields = () => {
  $$("[data-bind]").forEach((input) => {
    const value = getPath(state.content, input.dataset.bind);
    input.value = value ?? "";
  });
  $("#about-paragraphs").value = state.content.about.paragraphs.join("\n\n");
  $("#about-preview").src = imageUrl(state.content.about.image);
  $("#about-preview").alt = state.content.about.imageAlt;
};

const serviceCard = (item, index, total) => `
  <article class="editor-card" data-service-index="${index}">
    <div class="card-header">
      <div class="card-title"><strong>${escapeHtml(item.title)}</strong></div>
      <div class="order-actions">
        <button class="icon-button" data-service-action="up" title="위로" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-button" data-service-action="down" title="아래로" ${index === total - 1 ? "disabled" : ""}>↓</button>
        <button class="button small" data-service-action="delete">삭제</button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-grid">
        <label class="wide">서비스 제목<textarea data-service-field="title" rows="2" maxlength="80">${escapeHtml(item.title)}</textarea></label>
        <fieldset class="icon-picker wide">
          <legend>아이콘</legend>
          <div class="icon-options">
            ${Object.entries(serviceIcons).map(([name, icon]) => `
              <label class="icon-option">
                <input type="radio" data-service-field="icon" name="service-icon-${escapeHtml(item.id)}" value="${name}" ${item.icon === name ? "checked" : ""}>
                <span class="icon-preview">${serviceIconSvg(name)}</span>
                <span>${escapeHtml(icon.label)}</span>
              </label>`).join("")}
          </div>
        </fieldset>
        <label class="wide">설명<textarea data-service-field="description" rows="4" maxlength="500">${escapeHtml(item.description)}</textarea></label>
        <label class="check-label wide"><input data-service-field="published" type="checkbox" ${item.published ? "checked" : ""}> 홈페이지에 공개</label>
      </div>
    </div>
  </article>`;

const renderServices = () => {
  const items = state.content.services.items;
  $("#services-list").innerHTML = items.length
    ? items.map((item, index) => serviceCard(item, index, items.length)).join("")
    : '<div class="empty">등록된 서비스가 없습니다.</div>';
};

const imageCard = (image, imageIndex, item) => `
  <div class="image-card ${item.coverImageId === image.id ? "cover" : ""}" data-image-index="${imageIndex}">
    ${item.coverImageId === image.id ? '<span class="cover-badge">대표</span>' : ""}
    <img src="${escapeHtml(imageUrl(image.file))}" alt="${escapeHtml(image.caption || image.alt)}">
    <div class="image-fields">
      <label>시공 장소 또는 간단한 설명
        <textarea data-image-field="caption" rows="3" maxlength="240" aria-label="시공 장소 또는 간단한 설명" placeholder="예: 안성 ○○공장 크린부스 내부 시공">${escapeHtml(image.caption)}</textarea>
      </label>
    </div>
    <div class="image-toolbar">
      <div class="row-actions">
        <button class="icon-button" data-image-action="up" title="앞으로" ${imageIndex === 0 ? "disabled" : ""}>←</button>
        <button class="icon-button" data-image-action="down" title="뒤로" ${imageIndex === item.images.length - 1 ? "disabled" : ""}>→</button>
      </div>
      <div class="row-actions">
        <button class="button small" data-image-action="cover" ${item.coverImageId === image.id ? "disabled" : ""}>대표 지정</button>
        <button class="button small" data-image-action="delete">삭제</button>
      </div>
    </div>
  </div>`;

const caseCard = (item, index, total) => {
  return `
    <article class="editor-card" data-case-index="${index}">
      <div class="card-header">
        <div class="card-title"><strong>${escapeHtml(item.title)}</strong></div>
        <div class="order-actions">
          <button class="icon-button" data-case-action="up" title="위로" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-button" data-case-action="down" title="아래로" ${index === total - 1 ? "disabled" : ""}>↓</button>
          <button class="button small" data-case-action="delete">현장 삭제</button>
        </div>
      </div>
      <div class="card-body">
        <div class="card-grid case-summary-grid">
          <label>시공 분야<input data-case-field="title" maxlength="40" value="${escapeHtml(item.title)}" placeholder="예: 시스템실링"></label>
          <label class="check-label published-check"><input data-case-field="published" type="checkbox" ${item.published ? "checked" : ""}> 홈페이지에 공개</label>
          <label class="wide">현장 설명<textarea data-case-field="description" rows="3" maxlength="600">${escapeHtml(item.description)}</textarea></label>
        </div>
        <div class="panel-heading">
          <div><h3>현장 사진 (${item.images.length}장)</h3><p class="help">대표 사진과 표시 순서를 지정할 수 있습니다.</p></div>
          <label class="upload-button">사진 추가<input data-case-upload type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
        </div>
        <div class="upload-progress" hidden></div>
        <div class="image-grid">
          ${item.images.map((image, imageIndex) => imageCard(image, imageIndex, item)).join("")}
        </div>
        ${item.images.length ? "" : '<div class="empty">사진을 한 장 이상 추가해야 저장할 수 있습니다.</div>'}
      </div>
    </article>`;
};

const renderCases = () => {
  const cases = state.content.portfolio.cases;
  $("#cases-list").innerHTML = cases.length
    ? cases.map((item, index) => caseCard(item, index, cases.length)).join("")
    : '<div class="empty">등록된 현장 사례가 없습니다. ‘현장 추가’를 눌러 시작하세요.</div>';
};

const render = () => {
  bindStaticFields();
  renderServices();
  renderCases();
};

const confirmAction = (title, message) =>
  new Promise((resolve) => {
    const dialog = $("#confirm-dialog");
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.showModal();
  });

const swap = (items, from, to) => {
  if (to < 0 || to >= items.length) return;
  [items[from], items[to]] = [items[to], items[from]];
  normalizeOrders(items);
  markDirty();
};

const randomId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint16Array(1))[0].toString(36)}`;

const ulid = () => {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let time = BigInt(Date.now());
  let head = "";
  for (let index = 0; index < 10; index += 1) {
    head = alphabet[Number(time % 32n)] + head;
    time /= 32n;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return head + [...bytes].map((byte) => alphabet[byte % 32]).join("");
};

const loadBitmap = async (file) => {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const optimizeImage = async (file) => {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error(`${file.name}: JPG, PNG, WebP 파일만 사용할 수 있습니다.`);
  }
  const bitmap = await loadBitmap(file);
  const sourceWidth = bitmap.width || bitmap.naturalWidth;
  const sourceHeight = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, 1920 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { alpha: false }).drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error(`${file.name}: WebP 변환에 실패했습니다.`);
  if (blob.size > 2_000_000) {
    throw new Error(`${file.name}: 최적화 후에도 2MB를 초과합니다.`);
  }
  return { blob, width, height };
};

const uploadOptimizedImage = async (file, targetKind, caseId = "") => {
  const optimized = await optimizeImage(file);
  const form = new FormData();
  form.set("targetKind", targetKind);
  form.set("caseId", caseId);
  form.set("file", optimized.blob, `${file.name.replace(/\.[^.]+$/, "")}.webp`);
  const result = await api("/api/images", { method: "POST", body: form });
  state.stagedImages.push({ receipt: result.receipt });
  const preview = URL.createObjectURL(optimized.blob);
  state.previewUrls.set(result.path, preview);
  return { ...result, preview };
};

const uploadAbout = async (file) => {
  setBusy(true, "사진 처리 중…");
  try {
    const result = await uploadOptimizedImage(file, "about");
    state.content.about.image = result.path;
    $("#about-preview").src = result.preview;
    markDirty();
    showNotice("회사소개 사진을 준비했습니다. 저장 버튼을 눌러 반영하세요.");
  } finally {
    setBusy(false);
  }
};

const uploadCaseImages = async (caseIndex, files, progress) => {
  const item = state.content.portfolio.cases[caseIndex];
  let added = 0;
  setBusy(true, "사진 처리 중…");
  progress.hidden = false;
  try {
    for (let index = 0; index < files.length; index += 1) {
      progress.textContent = `${files.length}장 중 ${index + 1}장 최적화·업로드 중…`;
      const result = await uploadOptimizedImage(files[index], "portfolio", item.id);
      const image = {
        id: result.imageId,
        file: result.path,
        alt: `${item.title} ${item.images.length + 1}`,
        caption: "",
        width: result.width,
        height: result.height,
        order: item.images.length + 1,
      };
      item.images.push(image);
      if (!item.coverImageId) item.coverImageId = image.id;
      added += 1;
      markDirty();
    }
    normalizeOrders(item.images);
    showNotice(`${files.length}장의 사진을 준비했습니다. 저장 버튼을 눌러 반영하세요.`);
  } finally {
    if (added) {
      normalizeOrders(item.images);
      renderCases();
    }
    setBusy(false);
    progress.hidden = true;
  }
};

const validateBeforeSave = () => {
  const { about, services, portfolio } = state.content;
  if (!about.heading.trim() || !about.paragraphs.every((value) => value.trim())) {
    throw new Error("회사소개 제목과 본문을 입력해 주세요.");
  }
  if (!services.items.length) throw new Error("서비스를 한 개 이상 등록해 주세요.");
  for (const item of services.items) {
    if (!item.title.trim() || !item.description.trim()) {
      throw new Error("모든 서비스의 제목과 설명을 입력해 주세요.");
    }
  }
  for (const item of portfolio.cases) {
    if (!item.title.trim() || !item.description.trim()) {
      throw new Error("모든 현장의 시공 분야와 설명을 입력해 주세요.");
    }
    if (!item.images.length) throw new Error(`‘${item.title}’에 사진을 한 장 이상 추가해 주세요.`);
    if (!item.images.some((image) => image.id === item.coverImageId)) {
      throw new Error(`‘${item.title}’의 대표 사진을 지정해 주세요.`);
    }
    item.images.forEach((image, index) => {
      image.alt = image.caption.trim() || `${item.title} ${index + 1}`;
    });
    if (item.images.some((image) => !image.caption.trim())) {
      throw new Error(`‘${item.title}’의 모든 사진에 시공 장소 또는 간단한 설명을 입력해 주세요.`);
    }
  }
};

const syncPortfolioCategories = () => {
  const portfolio = state.content.portfolio;
  const previous = portfolio.categories || [];
  const byLabel = new Map();
  const categories = [];

  portfolio.cases.forEach((item) => {
    const label = item.title.trim();
    const key = label.toLocaleLowerCase("ko-KR");
    let category = byLabel.get(key);
    if (!category) {
      const existing = previous.find((candidate) => candidate.label.trim().toLocaleLowerCase("ko-KR") === key);
      category = {
        id: existing?.id || randomId("field"),
        label,
        order: categories.length + 1,
      };
      byLabel.set(key, category);
      categories.push(category);
    }
    item.categoryId = category.id;
  });

  portfolio.categories = categories.length ? categories : previous;
};

const save = async () => {
  setBusy(true, "저장 중…");
  try {
    validateBeforeSave();
    syncPortfolioCategories();
    const result = await api("/api/content", {
      method: "PUT",
      body: JSON.stringify({
        baseCommit: state.baseCommit,
        idempotencyKey: crypto.randomUUID(),
        content: {
          about: state.content.about,
          services: state.content.services,
          portfolio: state.content.portfolio,
        },
        stagedImages: state.stagedImages,
      }),
    });
    state.baseCommit = result.commit;
    state.latestCmsCommit = result.commit;
    state.stagedImages = [];
    markClean();
    $("#revert-button").disabled = false;
    const message = "develop-codex에 저장했습니다.\n운영 홈페이지는 변경되지 않습니다. 로컬 미리보기에서 확인하세요.";
    showNotice(message);
    showResultDialog("저장 완료", message);
  } catch (error) {
    let message;
    if (error.status === 409) {
      message = "다른 변경이 먼저 저장되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
    } else {
      message = errorMessage(error);
    }
    showNotice(message, true);
    showResultDialog("저장 실패", message, true);
  } finally {
    setBusy(false);
  }
};

const revertLatest = async () => {
  if (!state.latestCmsCommit) return;
  if (state.dirty) {
    showNotice("되돌리기 전에 현재 편집 내용을 저장하거나 페이지를 새로고침해 주세요.", true);
    return;
  }
  const confirmed = await confirmAction(
    "마지막 변경 되돌리기",
    "가장 최근에 관리자 화면에서 저장한 변경 전체를 이전 상태로 되돌립니다.",
  );
  if (!confirmed) return;
  setBusy(true, "되돌리는 중…");
  try {
    const result = await api("/api/revert", {
      method: "POST",
      body: JSON.stringify({
        baseCommit: state.baseCommit,
        targetCommit: state.latestCmsCommit,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    showNotice("마지막 변경을 되돌렸습니다. 최신 내용을 다시 불러옵니다.");
    await loadContent();
    showNotice("되돌리기를 develop-codex에 저장했습니다. 운영 홈페이지는 변경되지 않습니다.");
  } catch (error) {
    showNotice(errorMessage(error), true);
  } finally {
    setBusy(false);
  }
};

const loadContent = async () => {
  setBusy(true, "불러오는 중…");
  try {
    const result = await api("/api/content");
    state.content = clone(result.content);
    state.baseCommit = result.baseCommit;
    state.latestCmsCommit = result.latestCmsCommit;
    state.stagedImages = [];
    state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    state.previewUrls.clear();
    render();
    markClean();
    $("#loading").hidden = true;
    $$(".tab-panel").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== "about";
    });
    $("#revert-button").disabled = !state.latestCmsCommit;
  } catch (error) {
    $("#loading").textContent = errorMessage(error);
    showNotice("콘텐츠를 불러오지 못했습니다. Access 및 GitHub 설정을 확인해 주세요.", true);
  } finally {
    setBusy(false);
  }
};

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((item) => item.classList.toggle("active", item === tab));
    $$(".tab-panel").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab.dataset.tab;
    });
  });
});

document.addEventListener("input", (event) => {
  const input = event.target;
  if (!state.content) return;
  if (input.dataset.bind) {
    const numeric = input.type === "number";
    setPath(state.content, input.dataset.bind, numeric ? Number(input.value) : input.value);
    if (input.dataset.bind === "about.imageAlt") $("#about-preview").alt = input.value;
    markDirty();
  }
  if (input === $("#about-paragraphs")) {
    state.content.about.paragraphs = input.value
      .split(/\n\s*\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    markDirty();
  }
  const serviceCardElement = input.closest("[data-service-index]");
  if (serviceCardElement && input.dataset.serviceField) {
    const item = state.content.services.items[Number(serviceCardElement.dataset.serviceIndex)];
    item[input.dataset.serviceField] = input.type === "checkbox" ? input.checked : input.value;
    if (input.dataset.serviceField === "title") $(".card-title strong", serviceCardElement).textContent = input.value || "제목 없음";
    markDirty();
  }
  const caseCardElement = input.closest("[data-case-index]");
  if (caseCardElement && input.dataset.caseField) {
    const item = state.content.portfolio.cases[Number(caseCardElement.dataset.caseIndex)];
    item[input.dataset.caseField] = input.type === "checkbox" ? input.checked : input.value;
    if (input.dataset.caseField === "title") $(".card-title strong", caseCardElement).textContent = input.value || "시공 분야 없음";
    markDirty();
  }
  const imageCardElement = input.closest("[data-image-index]");
  if (caseCardElement && imageCardElement && input.dataset.imageField) {
    const item = state.content.portfolio.cases[Number(caseCardElement.dataset.caseIndex)];
    const image = item.images[Number(imageCardElement.dataset.imageIndex)];
    image[input.dataset.imageField] = input.value;
    markDirty();
  }
});

$("#services-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-service-action]");
  if (!button) return;
  const card = button.closest("[data-service-index]");
  const index = Number(card.dataset.serviceIndex);
  const items = state.content.services.items;
  if (button.dataset.serviceAction === "up") swap(items, index, index - 1);
  if (button.dataset.serviceAction === "down") swap(items, index, index + 1);
  if (button.dataset.serviceAction === "delete") {
    if (items.length === 1) return showNotice("서비스는 한 개 이상 있어야 합니다.", true);
    if (!(await confirmAction("서비스 삭제", `‘${items[index].title}’ 서비스를 삭제할까요?`))) return;
    items.splice(index, 1);
    normalizeOrders(items);
    markDirty();
  }
  renderServices();
});

$("#cases-list").addEventListener("click", async (event) => {
  const caseElement = event.target.closest("[data-case-index]");
  if (!caseElement) return;
  const caseIndex = Number(caseElement.dataset.caseIndex);
  const cases = state.content.portfolio.cases;
  const item = cases[caseIndex];
  const caseAction = event.target.closest("[data-case-action]")?.dataset.caseAction;
  const imageElement = event.target.closest("[data-image-index]");
  const imageAction = event.target.closest("[data-image-action]")?.dataset.imageAction;

  // 입력칸이나 월 선택기를 클릭했을 때 카드를 다시 만들면 포커스와
  // 브라우저 기본 선택기가 즉시 사라진다. 실제 동작 버튼일 때만 렌더링한다.
  if (!caseAction && !(imageElement && imageAction)) return;

  if (caseAction === "up") swap(cases, caseIndex, caseIndex - 1);
  if (caseAction === "down") swap(cases, caseIndex, caseIndex + 1);
  if (caseAction === "delete") {
    if (!(await confirmAction("현장 삭제", `‘${item.title}’ 현장과 사진 ${item.images.length}장을 모두 삭제할까요?`))) return;
    item.images.forEach((image) => {
      const url = state.previewUrls.get(image.file);
      if (url) URL.revokeObjectURL(url);
      state.previewUrls.delete(image.file);
    });
    cases.splice(caseIndex, 1);
    normalizeOrders(cases);
    markDirty();
  }
  if (imageElement && imageAction) {
    const imageIndex = Number(imageElement.dataset.imageIndex);
    if (imageAction === "up") swap(item.images, imageIndex, imageIndex - 1);
    if (imageAction === "down") swap(item.images, imageIndex, imageIndex + 1);
    if (imageAction === "cover") {
      item.coverImageId = item.images[imageIndex].id;
      markDirty();
    }
    if (imageAction === "delete") {
      if (item.images.length === 1) return showNotice("현장에는 사진이 한 장 이상 있어야 합니다.", true);
      if (!(await confirmAction("사진 삭제", "이 사진을 삭제할까요? 저장하면 Git에서도 함께 제거됩니다."))) return;
      const [removed] = item.images.splice(imageIndex, 1);
      if (item.coverImageId === removed.id) item.coverImageId = item.images[0].id;
      normalizeOrders(item.images);
      markDirty();
    }
  }
  renderCases();
});

$("#cases-list").addEventListener("change", async (event) => {
  const input = event.target.closest("[data-case-upload]");
  if (!input?.files?.length) return;
  const caseElement = input.closest("[data-case-index]");
  const progress = $(".upload-progress", caseElement);
  try {
    await uploadCaseImages(Number(caseElement.dataset.caseIndex), [...input.files], progress);
  } catch (error) {
    showNotice(errorMessage(error), true);
  } finally {
    input.value = "";
  }
});

$("#about-image-input").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    await uploadAbout(file);
  } catch (error) {
    showNotice(errorMessage(error), true);
  } finally {
    event.target.value = "";
  }
});

$("#add-service").addEventListener("click", () => {
  const items = state.content.services.items;
  items.push({
    id: randomId("service"),
    title: "새 서비스",
    description: "서비스 설명을 입력해 주세요.",
    icon: "grid",
    order: items.length + 1,
    published: false,
  });
  markDirty();
  renderServices();
});

$("#add-case").addEventListener("click", () => {
  const cases = state.content.portfolio.cases;
  cases.push({
    id: ulid(),
    title: "새 시공 분야",
    categoryId: "",
    description: "현장 설명을 입력해 주세요.",
    order: cases.length + 1,
    published: false,
    coverImageId: "",
    images: [],
  });
  markDirty();
  renderCases();
  $("#cases-list .editor-card:last-child")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#save-button").addEventListener("click", () => save().catch((error) => showNotice(errorMessage(error), true)));
$("#revert-button").addEventListener("click", revertLatest);
window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

loadContent();
