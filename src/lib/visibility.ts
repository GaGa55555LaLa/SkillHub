import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * DESIGN.md §6.1 可見性判斷 —— 一律在後端強制執行。
 *
 * 可見 skill =
 *   org 來源的所有已發布 skill
 *   ∪ skill_shares 命中「本人」或「本人所屬 team」的已發布 skill
 *     （share.skillId 為 null 代表整個 source 層級的分享）
 *   ∪ 自己擁有的所有 skill（無論是否發布）
 */
export function visibleSkillsWhere(viewer: {
  userId: string;
  githubId: bigint;
  teamIds: bigint[];
}): Prisma.SkillWhereInput {
  const shareHit: Prisma.SkillShareWhereInput = {
    OR: [
      { granteeType: "user", granteeId: viewer.githubId },
      ...(viewer.teamIds.length > 0
        ? [{ granteeType: "team" as const, granteeId: { in: viewer.teamIds } }]
        : []),
    ],
  };

  return {
    OR: [
      // org repo：全員可見
      { isPublished: true, source: { ownerType: "org" } },
      // 分享命中：針對單一 skill 的分享
      { isPublished: true, shares: { some: shareHit } },
      // 分享命中：source 層級的分享（share.skillId = null）
      {
        isPublished: true,
        source: { shares: { some: { ...shareHit, skillId: null } } },
      },
      // 自己的 skill 永遠可見
      { source: { ownerUserId: viewer.userId } },
    ],
  };
}

/** 檢查單一 skill 對 viewer 是否可見（詳細頁 / 下載用）。 */
export async function canViewSkill(
  skillId: string,
  viewer: { userId: string; githubId: bigint; teamIds: bigint[] }
): Promise<boolean> {
  const skill = await prisma.skill.findFirst({
    where: { id: skillId, ...visibleSkillsWhere(viewer) },
    select: { id: true },
  });
  return skill !== null;
}
