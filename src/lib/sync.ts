import matter from "gray-matter";
import { prisma } from "@/lib/prisma";
import {
  getInstallationClient,
  listInstallationRepos,
  getHeadSha,
  findSkillDirs,
  getFileContent,
  listSkillFiles,
} from "@/lib/github";

/**
 * DESIGN.md §3.1：掃描 org installation 底下所有 repo。
 * 用 head commit sha 做 diff，只有變動過的 repo 才重新掃描全樹；
 * 沒有 SKILL.md 的 repo 不會建立 source。
 */
export async function syncOrgInstallation(installationId: number | bigint) {
  const octokit = await getInstallationClient(installationId);
  const repos = await listInstallationRepos(installationId);

  for (const repo of repos) {
    const headSha = await getHeadSha(octokit, repo.fullName, repo.defaultBranch);
    const existing = await prisma.skillSource.findUnique({
      where: { repoFullName: repo.fullName },
    });
    if (existing?.lastCommitSha === headSha) continue;

    const skillDirs = await findSkillDirs(octokit, repo.fullName, headSha);
    if (skillDirs.length === 0 && !existing) continue;

    const source = await prisma.skillSource.upsert({
      where: { repoFullName: repo.fullName },
      update: {
        visibility: repo.private ? "private" : "public",
        lastCommitSha: headSha,
        lastSyncedAt: new Date(),
      },
      create: {
        repoFullName: repo.fullName,
        ownerType: "org",
        installationId: BigInt(installationId),
        visibility: repo.private ? "private" : "public",
        lastCommitSha: headSha,
        lastSyncedAt: new Date(),
      },
    });

    await syncSkillsForSource(source.id, repo.fullName, skillDirs, headSha, {
      octokit,
      defaultPublished: true,
    });
  }
}

/**
 * DESIGN.md §3.2：同步單一個人 repo source。
 * share_mode = selected_only 時，新發現的 skill 預設 is_published = false。
 */
export async function syncUserSource(sourceId: string) {
  const source = await prisma.skillSource.findUniqueOrThrow({
    where: { id: sourceId },
  });
  const octokit = await getInstallationClient(source.installationId);
  const [owner, repo] = source.repoFullName.split("/");
  const repoInfo = await octokit.request("GET /repos/{owner}/{repo}", {
    owner,
    repo,
  });
  const headSha = await getHeadSha(
    octokit,
    source.repoFullName,
    repoInfo.data.default_branch
  );
  if (source.lastCommitSha === headSha) return;

  const skillDirs = await findSkillDirs(octokit, source.repoFullName, headSha);
  await prisma.skillSource.update({
    where: { id: source.id },
    data: {
      visibility: repoInfo.data.private ? "private" : "public",
      lastCommitSha: headSha,
      lastSyncedAt: new Date(),
    },
  });

  await syncSkillsForSource(source.id, source.repoFullName, skillDirs, headSha, {
    octokit,
    defaultPublished: source.shareMode === "whole_repo",
  });
}

type SyncCtx = {
  octokit: Awaited<ReturnType<typeof getInstallationClient>>;
  defaultPublished: boolean;
};

/** 掃描結果寫入 skills 表 + 快取檔案內容（DESIGN.md §5 方案 A）。 */
async function syncSkillsForSource(
  sourceId: string,
  repoFullName: string,
  skillDirs: string[],
  headSha: string,
  ctx: SyncCtx
) {
  for (const dir of skillDirs) {
    const skillMdPath = dir === "" ? "SKILL.md" : `${dir}/SKILL.md`;
    const raw = await getFileContent(ctx.octokit, repoFullName, skillMdPath, headSha);
    if (raw === null) continue;

    const { data } = matter(raw);
    const name = (data.name as string) ?? dir.split("/").pop() ?? repoFullName;
    const description = (data.description as string) ?? null;

    const skill = await prisma.skill.upsert({
      where: { sourceId_path: { sourceId, path: dir } },
      update: { name, description, contentSha: headSha },
      create: {
        sourceId,
        path: dir,
        name,
        description,
        contentSha: headSha,
        isPublished: ctx.defaultPublished,
      },
    });

    const files = await listSkillFiles(ctx.octokit, repoFullName, dir, headSha);
    for (const filePath of files) {
      const content = await getFileContent(ctx.octokit, repoFullName, filePath, headSha);
      if (content === null) continue;
      await prisma.skillContentCache.upsert({
        where: { skillId_filePath: { skillId: skill.id, filePath } },
        update: { fileContent: content, cachedAt: new Date() },
        create: { skillId: skill.id, filePath, fileContent: content },
      });
    }
  }

  // 移除 repo 裡已不存在的 skill
  await prisma.skill.deleteMany({
    where: { sourceId, path: { notIn: skillDirs } },
  });
}
