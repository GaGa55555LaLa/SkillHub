import matter from "gray-matter";
import { prisma } from "@/lib/prisma";
import {
  getInstallationClient,
  getHeadSha,
  findSkillDirs,
  getFileContent,
  listSkillFiles,
} from "@/lib/github";

/**
 * DESIGN.md §3（v2）：同步單一來源（使用者連結的 repo）。
 * 用 head commit sha 做 diff，沒變動就跳過；share_mode = selected_only
 * 時，新發現的 skill 預設 is_published = false。
 * （v1 的 org 全量掃描 syncOrgInstallation 已移除——來源只剩使用者
 * 連結的 repo 一種。）
 */
export async function syncSource(sourceId: string) {
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
  if (source.lastCommitSha === headSha) {
    // 內容沒變也要同步 repo 的公開/私有狀態——在 GitHub 上切換 repo
    // visibility 不會產生新 commit,不能被 sha diff 跳過。
    await prisma.skillSource.update({
      where: { id: source.id },
      data: {
        visibility: repoInfo.data.private ? "private" : "public",
        lastSyncedAt: new Date(),
      },
    });
    return;
  }

  const skillDirs = await findSkillDirs(octokit, source.repoFullName, headSha);
  await prisma.skillSource.update({
    where: { id: source.id },
    data: {
      visibility: repoInfo.data.private ? "private" : "public",
      lastCommitSha: headSha,
      lastSyncedAt: new Date(),
    },
  });

  const defaultPublished = source.shareMode === "whole_repo";

  for (const dir of skillDirs) {
    const skillMdPath = dir === "" ? "SKILL.md" : `${dir}/SKILL.md`;
    const raw = await getFileContent(octokit, source.repoFullName, skillMdPath, headSha);
    if (raw === null) continue;

    const { data } = matter(raw);
    const name =
      (data.name as string) ?? dir.split("/").pop() ?? source.repoFullName;
    const description = (data.description as string) ?? null;

    const skill = await prisma.skill.upsert({
      where: { sourceId_path: { sourceId: source.id, path: dir } },
      update: { name, description, contentSha: headSha },
      create: {
        sourceId: source.id,
        path: dir,
        name,
        description,
        contentSha: headSha,
        isPublished: defaultPublished,
      },
    });

    const files = await listSkillFiles(octokit, source.repoFullName, dir, headSha);
    for (const filePath of files) {
      const content = await getFileContent(octokit, source.repoFullName, filePath, headSha);
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
    where: { sourceId: source.id, path: { notIn: skillDirs } },
  });
}
