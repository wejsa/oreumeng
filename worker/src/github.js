const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (value) => {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export class GitHubError extends Error {
  constructor(status, body) {
    super(`GitHub API ${status}`);
    this.name = "GitHubError";
    this.status = status;
    this.body = body;
  }
}

export class GitHubClient {
  constructor(env) {
    this.owner = env.GH_OWNER;
    this.repo = env.GH_REPO;
    this.branch = env.GH_BRANCH;
    this.token = env.GITHUB_TOKEN;
    this.base = `https://api.github.com/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  async request(pathname, options = {}) {
    const response = await fetch(`${this.base}${pathname}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "oreumeng-admin-worker",
        ...options.headers,
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) throw new GitHubError(response.status, body);
    return body;
  }

  getRef() {
    return this.request(`/git/ref/heads/${encodeURIComponent(this.branch)}`);
  }

  getCommit(sha) {
    return this.request(`/git/commits/${encodeURIComponent(sha)}`);
  }

  listCommits(startSha, perPage = 100) {
    const params = new URLSearchParams({
      sha: startSha,
      per_page: String(perPage),
    });
    return this.request(`/commits?${params}`);
  }

  getTree(sha, recursive = false) {
    return this.request(
      `/git/trees/${encodeURIComponent(sha)}${recursive ? "?recursive=1" : ""}`,
    );
  }

  async getFile(filePath, ref = this.branch) {
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const file = await this.request(
      `/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    );
    if (Array.isArray(file) || file.type !== "file" || file.encoding !== "base64") {
      throw new GitHubError(422, { message: `Not a file: ${filePath}` });
    }
    return {
      ...file,
      bytes: base64ToBytes(file.content),
      text: decoder.decode(base64ToBytes(file.content)),
    };
  }

  createBlob(bytes) {
    const value = bytes instanceof Uint8Array ? bytes : encoder.encode(String(bytes));
    return this.request("/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: bytesToBase64(value), encoding: "base64" }),
    });
  }

  createTree(baseTree, entries) {
    return this.request("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree: entries }),
    });
  }

  createCommit({ message, tree, parent, author }) {
    return this.request("/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message,
        tree,
        parents: [parent],
        author: {
          name: author.name || "오름이엔지 CMS",
          email: author.email,
          date: new Date().toISOString(),
        },
      }),
    });
  }

  updateRef(sha) {
    return this.request(`/git/refs/heads/${encodeURIComponent(this.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha, force: false }),
    });
  }

  listWorkflowRuns(headSha) {
    const params = new URLSearchParams({
      branch: this.branch,
      head_sha: headSha,
      event: "push",
      per_page: "20",
    });
    return this.request(`/actions/runs?${params}`);
  }
}

export const treeMap = (tree) =>
  new Map(
    tree.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => [entry.path, entry.sha]),
  );
