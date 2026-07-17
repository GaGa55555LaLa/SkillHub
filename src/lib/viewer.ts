import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type Viewer = {
  userId: string;
  githubId: bigint;
  githubLogin: string;
  groupIds: string[];
};

/**
 * 把 DB user 補上群組 membership，組成可見性判斷（DESIGN.md §6.1）所需的
 * viewer。群組查詢一律走平台 DB，不打 GitHub API（v1 查 org teams 的
 * 版本已移除）。
 */
export async function buildViewer(user: {
  id: string;
  githubId: bigint;
  githubLogin: string;
}): Promise<Viewer> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId: user.id },
    select: { groupId: true },
  });
  return {
    userId: user.id,
    githubId: user.githubId,
    githubLogin: user.githubLogin,
    groupIds: memberships.map((m) => m.groupId),
  };
}

/** 從 session 解析 viewer。未登入回傳 null。 */
export async function getViewer(): Promise<Viewer | null> {
  const session = await auth();
  if (!session?.user?.githubLogin) return null;

  const user = await prisma.user.findUnique({
    where: { githubLogin: session.user.githubLogin },
  });
  if (!user) return null;

  return buildViewer(user);
}
