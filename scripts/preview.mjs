import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");
const branch = process.env.CMS_PREVIEW_BRANCH || "develop-codex";
const remoteRef = `origin/${branch}`;
const port = Number(process.env.CMS_PREVIEW_PORT || 8080);
const pollMs = Math.max(2000, Number(process.env.CMS_PREVIEW_POLL_MS || 3000));
let version = "starting";
let syncing = false;

const run = async (command, args, options = {}) => {
  const result = await exec(command, args, {
    cwd: root,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  return result.stdout.trim();
};

const git = (args) => run("git", args);

const build = async () => {
  const { stdout, stderr } = await exec(process.execPath, [resolve(root, "scripts/build.mjs")], {
    cwd: root,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  version = `${await git(["rev-parse", "HEAD"])}-${Date.now()}`;
};

const sync = async () => {
  if (syncing) return;
  syncing = true;
  try {
    const currentBranch = await git(["branch", "--show-current"]);
    if (currentBranch !== branch) {
      throw new Error(`현재 브랜치가 ${currentBranch || "없음"}입니다. ${branch}로 전환해 주세요.`);
    }
    const dirty = await git(["status", "--porcelain"]);
    if (dirty) {
      throw new Error("로컬 변경사항이 있어 자동 동기화할 수 없습니다. 먼저 커밋하거나 정리해 주세요.");
    }

    await git(["fetch", "--quiet", "origin", branch]);
    const local = await git(["rev-parse", "HEAD"]);
    const remote = await git(["rev-parse", remoteRef]);
    if (local !== remote) {
      try {
        await git(["merge-base", "--is-ancestor", local, remote]);
      } catch {
        throw new Error(`${branch} 로컬과 원격 이력이 갈라졌습니다. 자동 병합하지 않습니다.`);
      }
      await git(["merge", "--ff-only", remoteRef]);
      console.log(`[CMS 미리보기] 새 변경 ${remote.slice(0, 8)}을 받았습니다.`);
      await build();
      console.log("[CMS 미리보기] 빌드 완료. 브라우저를 자동으로 새로고침합니다.");
    }
  } catch (error) {
    console.error(`[CMS 미리보기] ${error.message}`);
  } finally {
    syncing = false;
  }
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

const liveReload = `<script>(()=>{let v;setInterval(async()=>{try{const n=await fetch('/__preview_version',{cache:'no-store'}).then(r=>r.text());if(v&&v!==n)location.reload();v=n}catch{}},1000)})()</script>`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/__preview_version") {
      response.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      response.end(version);
      return;
    }

    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = resolve(dist, `.${pathname}`);
    if (file !== dist && !file.startsWith(`${dist}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not-found");

    const type = mimeTypes[extname(file).toLowerCase()] || "application/octet-stream";
    response.setHeader("Content-Type", type);
    response.setHeader("Cache-Control", "no-store");
    if (type.startsWith("text/html")) {
      const html = await readFile(file, "utf8");
      response.end(html.replace("</body>", `${liveReload}</body>`));
      return;
    }
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
});

await build();
server.listen(port, "127.0.0.1", () => {
  console.log(`[CMS 미리보기] http://localhost:${port}`);
  console.log(`[CMS 미리보기] ${branch} 변경을 ${pollMs / 1000}초마다 확인합니다.`);
});
setInterval(sync, pollMs).unref();
await sync();
