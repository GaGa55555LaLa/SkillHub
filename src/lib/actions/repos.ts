"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { syncUserSource } from "@/lib/sync";

async function requireSourceOwner(sourceId: string) {
  const viewer = await getViewer();
  if (!viewer) throw new Error("unauthorized");

  const source = await prisma.skillSource.findUniqueOrThrow({
    where: { id: sourceId },
  });
  if (source.ownerType !== "user" || source.ownerUserId !== viewer.userId) {
    throw new Error("forbidden");
  }
  return { viewer, source };
}

/** DESIGN.md §3.2：切換 whole_repo / selected_only。 */
export async function updateShareMode(sourceId: string, formData: FormData) {
  await requireSourceOwner(sourceId);
  const shareMode = formData.get("shareMode");
  if (shareMode !== "whole_repo" && shareMode !== "selected_only") {
    throw new Error("invalid share mode");
  }
  await prisma.skillSource.update({
    where: { id: sourceId },
    data: { shareMode },
  });

  // 切成 whole_repo 代表「repo 內所有 skill 都套用同一組分享設定」，
  // 已存在但還沒發布的 skill 也要一起變成已發布，不能只影響未來新增的。
  if (shareMode === "whole_repo") {
    await prisma.skill.updateMany({
      where: { sourceId, isPublished: false },
      data: { isPublished: true },
    });
  }

  revalidatePath(`/settings/repos/${sourceId}`);
}

/** selected_only 模式下，逐 skill 開關是否曝光。 */
export async function toggleSkillPublished(
  sourceId: string,
  skillId: string,
  formData: FormData
) {
  const { source } = await requireSourceOwner(sourceId);
  const isPublished = formData.get("isPublished") === "true";
  await prisma.skill.update({
    where: { id: skillId, sourceId: source.id },
    data: { isPublished },
  });
  revalidatePath(`/settings/repos/${sourceId}`);
}

/**
 * 新增分享對象。skillId 為 null 代表整個 repo 層級的分享；
 * 帶 skillId 則只分享單一 skill（DESIGN.md §6：兩種粒度並存）。
 */
export async function addShare(sourceId: string, formData: FormData) {
  const { viewer, source } = await requireSourceOwner(sourceId);

  // "user:123" / "team:456" —— type 與 id 綁在同一個欄位，避免兩個獨立
  // select 選到對不上的組合（例如選了 team 但 id 其實是某個人的）。
  const grantee = formData.get("grantee");
  const skillId = formData.get("skillId");
  if (typeof grantee !== "string") throw new Error("missing grantee");
  const [granteeType, granteeId] = grantee.split(":");
  if (granteeType !== "user" && granteeType !== "team") {
    throw new Error("invalid grantee type");
  }
  if (!granteeId) {
    throw new Error("missing granteeId");
  }

  const resolvedSkillId =
    typeof skillId === "string" && skillId ? skillId : null;
  if (resolvedSkillId) {
    // 確保這個 skill 真的屬於這個 source，避免跨 source 亂塞
    await prisma.skill.findUniqueOrThrow({
      where: { id: resolvedSkillId, sourceId: source.id },
    });
  }

  // 不能用 upsert 搭配 compound unique key：skillId 可為 null，Prisma 的
  // compound unique input 型別不支援 null（Postgres 的 unique constraint
  // 本身對 NULL 也視為互不相等，不會擋重複），改用查詢後條件建立。
  const existing = await prisma.skillShare.findFirst({
    where: {
      sourceId: source.id,
      skillId: resolvedSkillId,
      granteeType,
      granteeId: BigInt(granteeId),
    },
  });
  if (!existing) {
    await prisma.skillShare.create({
      data: {
        sourceId: source.id,
        skillId: resolvedSkillId,
        granteeType,
        granteeId: BigInt(granteeId),
        grantedById: viewer.userId,
      },
    });
  }
  revalidatePath(`/settings/repos/${sourceId}`);
}

export async function removeShare(sourceId: string, shareId: string) {
  const { source } = await requireSourceOwner(sourceId);
  // deleteMany 而非 delete：delete 的 where 只能用唯一鍵，無法再疊加 sourceId 做歸屬檢查
  await prisma.skillShare.deleteMany({
    where: { id: shareId, sourceId: source.id },
  });
  revalidatePath(`/settings/repos/${sourceId}`);
}

export async function resyncSource(sourceId: string) {
  const { source } = await requireSourceOwner(sourceId);
  await syncUserSource(source.id);
  revalidatePath(`/settings/repos/${sourceId}`);
}
