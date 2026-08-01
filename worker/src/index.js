import { verifyAccess } from "./auth.js";
import { GitHubClient, GitHubError, treeMap } from "./github.js";
import { imageId, ulid, validUlid } from "./ids.js";
import { webpDimensions } from "./image.js";
import { signReceipt, verifyReceipt } from "./receipt.js";
import { validateAll } from "../../scripts/lib/schema.mjs";

const encoder = new TextEncoder();
const requestCounts = new Map();
const editableJsonPaths = [
  "data/about.json",
  "data/services.json",
  "data/portfolio.json",
];
const allowedPath = (value) =>
  editableJsonPaths.includes(value) ||
  value.startsWith("images/about/") ||
  value.startsWith("images/portfolio/");

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' blob: data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...responseHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

const fail = (status, code, message) => json({ ok: false, code, message }, status);

const parseJson = async (request, maxBytes = 1_000_000) => {
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("json-required"), { status: 415 });
  }
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) throw Object.assign(new Error("too-large"), { status: 413 });
  const text = await request.text();
  if (encoder.encode(text).byteLength > maxBytes) {
    throw Object.assign(new Error("too-large"), { status: 413 });
  }
  return JSON.parse(text);
};

const assertMutationRequest = (request) => {
  const origin = new URL(request.url).origin;
  if (request.headers.get("Origin") !== origin) {
    throw Object.assign(new Error("bad-origin"), { status: 403 });
  }
  if (request.headers.get("X-CMS-Request") !== "1") {
    throw Object.assign(new Error("csrf"), { status: 403 });
  }
};

const rateLimit = (email) => {
  const now = Date.now();
  const current = requestCounts.get(email);
  if (!current || current.resetAt < now) {
    requestCounts.set(email, { count: 1, resetAt: now + 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > 120) {
    throw Object.assign(new Error("rate-limit"), { status: 429 });
  }
};

const parseFileJson = (file, name) => {
  try {
    return JSON.parse(file.text);
  } catch {
    throw new Error(`invalid-repository-json:${name}`);
  }
};

const loadContent = async (github, ref = github.branch) => {
  const [siteFile, aboutFile, servicesFile, portfolioFile] = await Promise.all([
    github.getFile("data/site.json", ref),
    github.getFile("data/about.json", ref),
    github.getFile("data/services.json", ref),
    github.getFile("data/portfolio.json", ref),
  ]);
  const content = {
    site: parseFileJson(siteFile, "site"),
    about: parseFileJson(aboutFile, "about"),
    services: parseFileJson(servicesFile, "services"),
    portfolio: parseFileJson(portfolioFile, "portfolio"),
  };
  validateAll(content);
  return {
    content,
    files: {
      site: siteFile.sha,
      about: aboutFile.sha,
      services: servicesFile.sha,
      portfolio: portfolioFile.sha,
    },
  };
};

const imagePaths = ({ about, portfolio }) =>
  new Set([
    about.image,
    ...portfolio.cases.flatMap((item) => item.images.map((image) => image.file)),
  ]);

const commitForRequest = (commit, idempotencyKey) =>
  commit.message.includes(`[request:${idempotencyKey}]`);

const contentResponse = async (github) => {
  const reference = await github.getRef();
  const [loaded, latest] = await Promise.all([
    loadContent(github, reference.object.sha),
    latestCmsCommit(github, reference.object.sha),
  ]);
  return json({
    ok: true,
    baseCommit: reference.object.sha,
    latestCmsCommit: latest?.sha || null,
    files: loaded.files,
    content: loaded.content,
  });
};

const imageResponse = async (url, github) => {
  const imagePath = url.searchParams.get("path") || "";
  const requestedRef = url.searchParams.get("ref") || "";
  if (!allowedPath(imagePath)) {
    return fail(422, "invalid-image-path", "허용되지 않은 이미지 경로입니다.");
  }
  if (requestedRef && !/^[0-9a-f]{40}$/.test(requestedRef)) {
    return fail(422, "invalid-image-ref", "이미지 버전이 올바르지 않습니다.");
  }

  const file = await github.getFile(imagePath, requestedRef || github.branch);
  return new Response(file.bytes, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": requestedRef
        ? "private, max-age=31536000, immutable"
        : "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

const uploadImage = async (request, env, github, identity) => {
  const type = request.headers.get("Content-Type") || "";
  if (!/^multipart\/form-data;\s*boundary=/i.test(type)) {
    return fail(415, "multipart-required", "이미지 업로드 형식이 올바르지 않습니다.");
  }
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > 2_500_000) {
    return fail(413, "image-too-large", "이미지는 2MB 이하여야 합니다.");
  }
  const form = await request.formData();
  const targetKind = String(form.get("targetKind") || "");
  const caseId = String(form.get("caseId") || "");
  const file = form.get("file");
  if (!["about", "portfolio"].includes(targetKind)) {
    return fail(422, "invalid-target", "이미지 대상을 확인해 주세요.");
  }
  if (targetKind === "portfolio" && !validUlid(caseId)) {
    return fail(422, "invalid-case", "현장 ID가 올바르지 않습니다.");
  }
  if (targetKind === "about" && caseId) {
    return fail(422, "invalid-case", "회사소개 이미지에는 현장 ID를 사용할 수 없습니다.");
  }
  if (!(file instanceof File) || file.type !== "image/webp" || file.size > 2_000_000) {
    return fail(422, "invalid-image", "2MB 이하 WebP 이미지만 업로드할 수 있습니다.");
  }
  const buffer = await file.arrayBuffer();
  let dimensions;
  try {
    dimensions = webpDimensions(buffer);
  } catch {
    return fail(422, "invalid-image", "손상되었거나 지원하지 않는 WebP입니다.");
  }
  if (Math.max(dimensions.width, dimensions.height) > 1920) {
    return fail(422, "image-dimensions", "이미지 긴 변은 1920px 이하여야 합니다.");
  }

  const permanentId = imageId();
  const uploadId = ulid();
  const imagePath =
    targetKind === "portfolio"
      ? `images/portfolio/${caseId}/${permanentId}.webp`
      : `images/about/${permanentId}.webp`;
  const blob = await github.createBlob(new Uint8Array(buffer));
  const payload = {
    uploadId,
    imageId: permanentId,
    targetKind,
    caseId: targetKind === "portfolio" ? caseId : "",
    blobSha: blob.sha,
    path: imagePath,
    ...dimensions,
    email: identity.email,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
  return json({
    ok: true,
    ...payload,
    receipt: await signReceipt(payload, env.UPLOAD_RECEIPT_SECRET),
  });
};

const saveContent = async (request, env, github, identity) => {
  const body = await parseJson(request);
  const { baseCommit, idempotencyKey, content, stagedImages = [] } = body;
  if (
    !/^[0-9a-f]{40}$/.test(String(baseCommit)) ||
    !/^[0-9a-fA-F-]{36}$/.test(String(idempotencyKey))
  ) {
    return fail(422, "invalid-request", "저장 기준값이 올바르지 않습니다.");
  }

  const reference = await github.getRef();
  const head = reference.object.sha;
  const headCommit = await github.getCommit(head);
  if (commitForRequest(headCommit, idempotencyKey)) {
    return json({ ok: true, commit: head, idempotent: true });
  }
  if (head !== baseCommit) {
    return fail(409, "content-conflict", "다른 변경이 먼저 저장되었습니다.");
  }

  const old = await loadContent(github, baseCommit);
  const next = validateAll({
    site: old.content.site,
    about: content?.about,
    services: content?.services,
    portfolio: content?.portfolio,
  });
  const oldImages = imagePaths(old.content);
  const nextImages = imagePaths(next);
  const added = [...nextImages].filter((value) => !oldImages.has(value));
  const removed = [...oldImages].filter((value) => !nextImages.has(value));

  const receipts = new Map();
  for (const item of stagedImages) {
    const payload = await verifyReceipt(item.receipt, env.UPLOAD_RECEIPT_SECRET);
    if (payload.email !== identity.email) throw new Error("receipt-owner");
    receipts.set(payload.path, payload);
  }
  if (added.some((imagePath) => !receipts.has(imagePath))) {
    return fail(422, "missing-upload", "새 이미지의 업로드 정보가 없습니다.");
  }
  for (const imagePath of added) {
    const receipt = receipts.get(imagePath);
    const portfolioImage = next.portfolio.cases
      .flatMap((item) =>
        item.images.map((image) => ({ ...image, caseId: item.id })),
      )
      .find((image) => image.file === imagePath);
    if (portfolioImage) {
      if (
        receipt.targetKind !== "portfolio" ||
        receipt.caseId !== portfolioImage.caseId ||
        receipt.imageId !== portfolioImage.id ||
        receipt.width !== portfolioImage.width ||
        receipt.height !== portfolioImage.height
      ) {
        return fail(422, "upload-mismatch", "이미지 정보가 업로드 영수증과 다릅니다.");
      }
    } else if (
      imagePath !== next.about.image ||
      receipt.targetKind !== "about"
    ) {
      return fail(422, "upload-mismatch", "회사소개 이미지 정보가 올바르지 않습니다.");
    }
  }

  const commit = await github.getCommit(baseCommit);
  const jsonValues = {
    "data/about.json": next.about,
    "data/services.json": next.services,
    "data/portfolio.json": next.portfolio,
  };
  const entries = [];
  for (const [filePath, value] of Object.entries(jsonValues)) {
    const blob = await github.createBlob(`${JSON.stringify(value, null, 2)}\n`);
    entries.push({ path: filePath, mode: "100644", type: "blob", sha: blob.sha });
  }
  for (const imagePath of added) {
    entries.push({
      path: imagePath,
      mode: "100644",
      type: "blob",
      sha: receipts.get(imagePath).blobSha,
    });
  }
  for (const imagePath of removed) {
    if (!allowedPath(imagePath)) {
      return fail(422, "invalid-delete", "허용되지 않은 삭제 경로입니다.");
    }
    entries.push({ path: imagePath, mode: "100644", type: "blob", sha: null });
  }

  const tree = await github.createTree(commit.tree.sha, entries);
  const created = await github.createCommit({
    message: `[cms][request:${idempotencyKey}] 콘텐츠 수정`,
    tree: tree.sha,
    parent: baseCommit,
    author: { email: identity.email },
  });
  try {
    await github.updateRef(created.sha);
  } catch (error) {
    if (error instanceof GitHubError && [409, 422].includes(error.status)) {
      return fail(409, "content-conflict", "다른 변경이 먼저 저장되었습니다.");
    }
    throw error;
  }
  return json({ ok: true, commit: created.sha, idempotent: false });
};

const deploymentStatus = async (url, github) => {
  const sha = url.searchParams.get("commit") || "";
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    return fail(422, "invalid-commit", "커밋 SHA가 올바르지 않습니다.");
  }
  const result = await github.listWorkflowRuns(sha);
  const run = result.workflow_runs.find((item) => item.head_sha === sha);
  if (!run) return json({ ok: true, commit: sha, state: "queued" });
  const state =
    run.status !== "completed"
      ? "in_progress"
      : run.conclusion === "success"
        ? "success"
        : "failure";
  return json({
    ok: true,
    commit: sha,
    state,
    conclusion: run.conclusion,
    runUrl: run.html_url,
    updatedAt: run.updated_at,
  });
};

const latestCmsCommit = async (github, startSha) => {
  const commits = await github.listCommits(startSha);
  const latest = commits.find(
    (item) =>
      item.parents.length === 1 &&
      /^\[cms\](?:\[revert\])?\[request:/.test(item.commit.message),
  );
  if (!latest) return null;
  return { sha: latest.sha, commit: await github.getCommit(latest.sha) };
};

const revertContent = async (request, github, identity) => {
  const body = await parseJson(request, 50_000);
  const { baseCommit, targetCommit, idempotencyKey } = body;
  if (
    !/^[0-9a-f]{40}$/.test(String(baseCommit)) ||
    !/^[0-9a-f]{40}$/.test(String(targetCommit)) ||
    !/^[0-9a-fA-F-]{36}$/.test(String(idempotencyKey))
  ) {
    return fail(422, "invalid-request", "되돌리기 요청값이 올바르지 않습니다.");
  }
  const reference = await github.getRef();
  const currentSha = reference.object.sha;
  const currentCommit = await github.getCommit(currentSha);
  if (commitForRequest(currentCommit, idempotencyKey)) {
    return json({ ok: true, commit: currentSha, idempotent: true });
  }
  if (currentSha !== baseCommit) {
    return fail(409, "content-conflict", "다른 변경이 먼저 저장되었습니다.");
  }
  const latest = await latestCmsCommit(github, currentSha);
  if (!latest || latest.sha !== targetCommit || latest.commit.parents.length !== 1) {
    return fail(409, "invalid-revert", "가장 최근 CMS 변경만 되돌릴 수 있습니다.");
  }

  const parentSha = latest.commit.parents[0].sha;
  const [parentCommit, currentTree, targetTree] = await Promise.all([
    github.getCommit(parentSha),
    github.getTree(currentCommit.tree.sha, true),
    github.getTree(latest.commit.tree.sha, true),
  ]);
  const parentTree = await github.getTree(parentCommit.tree.sha, true);
  const before = treeMap(parentTree);
  const after = treeMap(targetTree);
  const current = treeMap(currentTree);
  const paths = new Set([...before.keys(), ...after.keys()]);
  const changed = [...paths].filter((filePath) => before.get(filePath) !== after.get(filePath));
  if (!changed.length || changed.some((filePath) => !allowedPath(filePath))) {
    return fail(409, "invalid-revert", "되돌릴 수 없는 경로가 포함되어 있습니다.");
  }
  if (changed.some((filePath) => current.get(filePath) !== after.get(filePath))) {
    return fail(409, "revert-conflict", "이후 변경된 파일이 있어 되돌릴 수 없습니다.");
  }
  const entries = changed.map((filePath) => ({
    path: filePath,
    mode: "100644",
    type: "blob",
    sha: before.get(filePath) || null,
  }));
  const tree = await github.createTree(currentCommit.tree.sha, entries);
  const created = await github.createCommit({
    message: `[cms][revert][request:${idempotencyKey}] ${targetCommit.slice(0, 12)} 되돌리기`,
    tree: tree.sha,
    parent: currentSha,
    author: { email: identity.email },
  });
  try {
    await github.updateRef(created.sha);
  } catch (error) {
    if (error instanceof GitHubError && [409, 422].includes(error.status)) {
      return fail(409, "content-conflict", "다른 변경이 먼저 저장되었습니다.");
    }
    throw error;
  }
  return json({ ok: true, commit: created.sha, reverted: targetCommit });
};

const handleApi = async (request, env, identity) => {
  const github = new GitHubClient(env);
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/content") {
    return contentResponse(github);
  }
  if (request.method === "GET" && url.pathname === "/api/image") {
    return imageResponse(url, github);
  }
  if (request.method === "POST" && url.pathname === "/api/images") {
    assertMutationRequest(request);
    return uploadImage(request, env, github, identity);
  }
  if (request.method === "PUT" && url.pathname === "/api/content") {
    assertMutationRequest(request);
    return saveContent(request, env, github, identity);
  }
  if (request.method === "GET" && url.pathname === "/api/status") {
    return deploymentStatus(url, github);
  }
  if (request.method === "POST" && url.pathname === "/api/revert") {
    assertMutationRequest(request);
    return revertContent(request, github, identity);
  }
  return fail(404, "not-found", "요청한 기능을 찾을 수 없습니다.");
};

export default {
  async fetch(request, env) {
    const identity = await verifyAccess(request, env);
    if (!identity.ok) return fail(401, "unauthorized", "로그인이 필요합니다.");
    try {
      rateLimit(identity.email);
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, identity);
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        return fail(405, "method-not-allowed", "허용되지 않은 요청입니다.");
      }
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      for (const [name, value] of Object.entries(responseHeaders)) {
        headers.set(name, value);
      }
      return new Response(asset.body, { status: asset.status, headers });
    } catch (error) {
      if (error instanceof GitHubError) {
        if (error.status === 401) {
          return fail(502, "github-token", "GitHub 인증 정보를 확인해 주세요.");
        }
        if (error.status === 403 || error.status === 429) {
          return fail(503, "github-limit", "GitHub 요청 한도에 도달했습니다.");
        }
        return fail(502, "github-error", "GitHub 처리 중 오류가 발생했습니다.");
      }
      if (error instanceof SyntaxError) {
        return fail(400, "invalid-json", "요청 JSON이 올바르지 않습니다.");
      }
      if (error.status) return fail(error.status, error.message, "요청을 처리할 수 없습니다.");
      return fail(500, "internal-error", "관리 도구에서 오류가 발생했습니다.");
    }
  },
};
