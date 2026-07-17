import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Viewer } from "@/lib/viewer";

/**
 * DESIGN.md §6.1（v2）可見性判斷 —— 一律在後端強制執行。
 *
 * 可見 skill =
 *   已發布 且 (source.isPublic 或 skill.isPublic)      -- 平台公開
 *   ∪ 已發布 且 shares 命中「本人」或「本人所屬群組」
 *     （share.skillId 為 null 代表整個 source 層級的分享）
 *   ∪ 自己擁有的所有 skill（無論是否發布/公開）
 *
 * 硬規則：isPublished = false 對非擁有者一律不可見，即使被分享或公開。
 */
export function visibleSkillsWhere(viewer: Viewer): Prisma.SkillWhereInput {
  const shareHit: Prisma.SkillShareWhereInput = {
    OR: [
      { granteeUserId: viewer.userId },
      ...(viewer.groupIds.length > 0
        ? [{ granteeGroupId: { in: viewer.groupIds } }]
        : []),
    ],
  };

  return {
    OR: [
      // 平台公開（repo 層級或單一 skill 層級）
      { isPublished: true, source: { isPublic: true } },
      { isPublished: true, isPublic: true },
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
  viewer: Viewer
): Promise<boolean> {
  const skill = await prisma.skill.findFirst({
    where: { id: skillId, ...visibleSkillsWhere(viewer) },
    select: { id: true },
  });
  return skill !== null;
}
