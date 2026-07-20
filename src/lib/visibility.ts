import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Viewer } from "@/lib/viewer";

/**
 * DESIGN.md §6.1（v2）可見性判斷 —— 一律在後端強制執行。
 *
 * 沒有「發布」這個中間狀態：連結 repo 後新掃到的 skill 預設不公開、
 * 不分享，本來就沒人看得到，可見性純粹由「公開」與「分享」決定。
 *
 * share_mode 決定看 repo 層級還是 skill 層級的設定，兩者互斥（不是
 * 疊加）——這樣「整包分享」和「逐一挑選」的意義才單純：
 *   - whole_repo：只看 source 層級的公開/分享，套用到底下所有 skill。
 *     切換模式時個別 skill 自己的設定不會被清掉，只是暫時不生效，
 *     切回 selected_only 會馬上恢復。
 *   - selected_only：只看每個 skill 自己的公開/分享。
 *
 * 可見 skill =
 *   (whole_repo 且 source 公開/分享命中) 或
 *   (selected_only 且 skill 自己公開/分享命中)
 *   ∪ 自己擁有的所有 skill（無論公開/分享設定）
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
      // whole_repo 模式：repo 層級的公開/分享 cascade 到所有 skill
      { source: { shareMode: "whole_repo", isPublic: true } },
      {
        source: {
          shareMode: "whole_repo",
          shares: { some: { ...shareHit, skillId: null } },
        },
      },
      // selected_only 模式：只看 skill 自己的公開/分享
      { source: { shareMode: "selected_only" }, isPublic: true },
      { source: { shareMode: "selected_only" }, shares: { some: shareHit } },
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
