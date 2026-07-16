import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getInstallationClient, listUserTeamIds } from "@/lib/github";

export type Viewer = {
  userId: string;
  githubId: bigint;
  githubLogin: string;
  teamIds: bigint[];
};

/**
 * 從 session 解析出可見性判斷所需的 viewer 資訊（DESIGN.md §6.1）。
 * 未登入或非 org 成員回傳 null。
 *
 * TODO: team 成員資訊每次請求都打 GitHub API 太慢，之後要加快取
 * （例如存進 session token 或 DB，隨排程 sync 更新）。
 */
export async function getViewer(): Promise<Viewer | null> {
  const session = await auth();
  if (!session?.user?.githubLogin) return null;

  const user = await prisma.user.findUnique({
    where: { githubLogin: session.user.githubLogin },
  });
  if (!user) return null;

  let teamIds: bigint[] = [];
  const orgInstallationId = process.env.GITHUB_ORG_INSTALLATION_ID;
  if (orgInstallationId) {
    try {
      const octokit = await getInstallationClient(BigInt(orgInstallationId));
      const ids = await listUserTeamIds(
        octokit,
        process.env.GITHUB_ORG!,
        user.githubLogin
      );
      teamIds = ids.map((id) => BigInt(id));
    } catch {
      // GitHub API 失敗時降級為「不含 team 分享」而非整站掛掉
    }
  }

  return {
    userId: user.id,
    githubId: user.githubId,
    githubLogin: user.githubLogin,
    teamIds,
  };
}
