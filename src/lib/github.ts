import { App } from "@octokit/app";
import type { Octokit } from "@octokit/core";

/**
 * DESIGN.md §2.1：GitHub App 用來「取資料」。
 * 平台一律用 installation token 讀取 repo 內容，與登入者身份無關。
 */
let app: App | undefined;

function getApp(): App {
  app ??= new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  });
  return app;
}

export async function getInstallationClient(
  installationId: number | bigint
): Promise<Octokit> {
  return getApp().getInstallationOctokit(Number(installationId));
}

let appSlug: string | undefined;

/** App 的公開頁 slug（用來組出 installation URL），透過 App 自身身份查詢並快取。 */
export async function getAppSlug(): Promise<string> {
  if (appSlug) return appSlug;
  const res = await getApp().octokit.request("GET /app");
  if (!res.data?.slug) throw new Error("GitHub App slug not found");
  appSlug = res.data.slug;
  return appSlug;
}

/** App 在某個 installation 底下可見的所有 repo（org 安裝時即所有 org repo）。 */
export async function listInstallationRepos(installationId: number | bigint) {
  const octokit = await getInstallationClient(installationId);
  const repos: {
    fullName: string;
    defaultBranch: string;
    private: boolean;
    pushedAt: string | null;
  }[] = [];
  let page = 1;
  for (;;) {
    const res = await octokit.request("GET /installation/repositories", {
      per_page: 100,
      page,
    });
    for (const r of res.data.repositories) {
      repos.push({
        fullName: r.full_name,
        defaultBranch: r.default_branch,
        private: r.private,
        pushedAt: r.pushed_at,
      });
    }
    if (res.data.repositories.length < 100) break;
    page++;
  }
  return repos;
}

/** default branch 最新 commit sha，用來 diff 判斷是否需要重新掃描。 */
export async function getHeadSha(
  octokit: Octokit,
  repoFullName: string,
  branch: string
): Promise<string> {
  const [owner, repo] = repoFullName.split("/");
  const res = await octokit.request(
    "GET /repos/{owner}/{repo}/git/ref/{ref}",
    { owner, repo, ref: `heads/${branch}` }
  );
  return res.data.object.sha;
}

/**
 * DESIGN.md §3.1：掃描 repo 樹，找出所有含 SKILL.md 的資料夾。
 * 回傳每個 skill root 的資料夾路徑（"" 表示 repo 根目錄本身就是一個 skill）。
 */
export async function findSkillDirs(
  octokit: Octokit,
  repoFullName: string,
  ref: string
): Promise<string[]> {
  const [owner, repo] = repoFullName.split("/");
  const res = await octokit.request(
    "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
    { owner, repo, tree_sha: ref, recursive: "1" }
  );
  return res.data.tree
    .filter(
      (item) =>
        item.type === "blob" &&
        (item.path === "SKILL.md" || item.path?.endsWith("/SKILL.md"))
    )
    .map((item) => item.path!.replace(/\/?SKILL\.md$/, ""));
}

/** 讀取單一檔案內容（base64 解碼）。 */
export async function getFileContent(
  octokit: Octokit,
  repoFullName: string,
  path: string,
  ref: string
): Promise<string | null> {
  const [owner, repo] = repoFullName.split("/");
  try {
    const res = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      { owner, repo, path, ref }
    );
    const data = res.data as { content?: string; encoding?: string };
    if (data.content && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

/** 列出 skill 資料夾底下的所有檔案路徑（相對 repo 根目錄）。 */
export async function listSkillFiles(
  octokit: Octokit,
  repoFullName: string,
  skillDir: string,
  ref: string
): Promise<string[]> {
  const [owner, repo] = repoFullName.split("/");
  const res = await octokit.request(
    "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
    { owner, repo, tree_sha: ref, recursive: "1" }
  );
  const prefix = skillDir === "" ? "" : `${skillDir}/`;
  return res.data.tree
    .filter((item) => item.type === "blob" && item.path!.startsWith(prefix))
    .map((item) => item.path!);
}

/**
 * 用 GitHub username 查公開的使用者資訊（App 自身身份即可呼叫）。
 * 供群組加人、個人分享時把 username 解析成穩定的 githubId
 * （DESIGN.md §4）。查不到（帳號不存在）回傳 null。
 */
export async function getUserByLogin(
  username: string
): Promise<{ githubId: number; login: string; avatarUrl: string } | null> {
  try {
    const res = await getApp().octokit.request("GET /users/{username}", {
      username,
    });
    return {
      githubId: res.data.id,
      login: res.data.login,
      avatarUrl: res.data.avatar_url,
    };
  } catch {
    return null;
  }
}
