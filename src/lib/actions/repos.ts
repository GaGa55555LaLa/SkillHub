"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { syncSource } from "@/lib/sync";
import { resolvePlatformUser } from "@/lib/actions/groups";

async function requireSourceOwner(sourceId: string) {
  const viewer = await getViewer();
  if (!viewer) throw new Error("unauthorized");

  const source = await prisma.skillSource.findUniqueOrThrow({
    where: { id: sourceId },
  });
  if (source.ownerUserId !== viewer.userId) {
    throw new Error("forbidden");
  }
  return { viewer, source };
}

/**
 * 切換 whole_repo / selected_only。whole_repo：repo 層級的公開/分享
 * cascade 到底下所有 skill；selected_only：只看每個 skill 各自的設定
 * （見 visibility.ts）。沒有「發布」這個中間狀態要處理。
 */
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
  revalidatePath(`/settings/repos/${sourceId}`);
}

/** DESIGN.md §6.1：平台公開開關（repo 層級）。 */
export async function toggleSourcePublic(sourceId: string, formData: FormData) {
  const { source } = await requireSourceOwner(sourceId);
  const isPublic = formData.get("isPublic") === "true";
  await prisma.skillSource.update({
    where: { id: source.id },
    data: { isPublic },
  });
  revalidatePath(`/settings/repos/${sourceId}`);
}

/** DESIGN.md §6.1：平台公開開關（單一 skill 層級）。 */
export async function toggleSkillPublic(
  sourceId: string,
  skillId: string,
  formData: FormData
) {
  const { source } = await requireSourceOwner(sourceId);
  const isPublic = formData.get("isPublic") === "true";
  await prisma.skill.update({
    where: { id: skillId, sourceId: source.id },
    data: { isPublic },
  });
  revalidatePath(`/settings/repos/${sourceId}`);
}

/**
 * 分享給自己的群組。skillId 為 null 代表整個 repo 層級的分享，
 * 帶 skillId 則只分享單一 skill（DESIGN.md §6：兩種粒度並存）。
 */
export async function addGroupShare(sourceId: string, formData: FormData) {
  const { viewer, source } = await requireSourceOwner(sourceId);

  const groupId = formData.get("groupId");
  const skillId = formData.get("skillId");
  if (typeof groupId !== "string" || !groupId) throw new Error("missing groupId");

  // 只能分享到自己建立的群組（分享到別人的群組沒有意義：你不知道裡面有誰）
  await prisma.group.findFirstOrThrow({
    where: { id: groupId, ownerUserId: viewer.userId },
  });

  const resolvedSkillId =
    typeof skillId === "string" && skillId ? skillId : null;
  if (resolvedSkillId) {
    await prisma.skill.findUniqueOrThrow({
      where: { id: resolvedSkillId, sourceId: source.id },
    });
  }

  const existing = await prisma.skillShare.findFirst({
    where: {
      sourceId: source.id,
      skillId: resolvedSkillId,
      granteeGroupId: groupId,
    },
  });
  if (!existing) {
    await prisma.skillShare.create({
      data: {
        sourceId: source.id,
        skillId: resolvedSkillId,
        granteeGroupId: groupId,
        grantedById: viewer.userId,
      },
    });
  }
  revalidatePath(`/settings/repos/${sourceId}`);
}

/**
 * 分享給單一使用者（輸入 GitHub username 解析）。
 * 給 useActionState 用：成功回 null，失敗回 { error }（顯示在表單旁）。
 */
export async function addUserShare(
  sourceId: string,
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const { viewer, source } = await requireSourceOwner(sourceId);

  const username = formData.get("username");
  const skillId = formData.get("skillId");
  if (typeof username !== "string" || !username.trim()) {
    return { error: "請輸入 username" };
  }

  let user;
  try {
    user = await resolvePlatformUser(username);
  } catch (e) {
    console.error(`[share] resolve failed for ${username.trim()}:`, e);
    return { error: "查詢 GitHub 失敗，請稍後再試" };
  }
  console.log(
    `[share] source=${source.repoFullName} skill=${skillId || "(repo)"} ` +
      `username=${username.trim()} resolved=${user?.githubLogin ?? "NOT_FOUND"}`
  );
  if (!user) {
    return { error: `GitHub 上找不到帳號「${username.trim()}」` };
  }

  const resolvedSkillId =
    typeof skillId === "string" && skillId ? skillId : null;
  if (resolvedSkillId) {
    await prisma.skill.findUniqueOrThrow({
      where: { id: resolvedSkillId, sourceId: source.id },
    });
  }

  const existing = await prisma.skillShare.findFirst({
    where: {
      sourceId: source.id,
      skillId: resolvedSkillId,
      granteeUserId: user.id,
    },
  });
  if (!existing) {
    await prisma.skillShare.create({
      data: {
        sourceId: source.id,
        skillId: resolvedSkillId,
        granteeUserId: user.id,
        grantedById: viewer.userId,
      },
    });
    console.log(`[share] created: ${user.githubLogin} <- ${source.repoFullName}`);
  }
  revalidatePath(`/settings/repos/${sourceId}`);
  return null;
}

export async function removeShare(sourceId: string, shareId: string) {
  const { source } = await requireSourceOwner(sourceId);
  // deleteMany 而非 delete：delete 的 where 只能用唯一鍵，無法再疊加 sourceId 做歸屬檢查
  await prisma.skillShare.deleteMany({
    where: { id: shareId, sourceId: source.id },
  });
  revalidatePath(`/settings/repos/${sourceId}`);
}

/**
 * 解除連結：刪掉 skill_source，cascade 一併清掉底下的 skills、內容快取、
 * 分享設定與 audit log。GitHub 端的 App installation 不受影響，
 * 之後可以重新連結（但分享設定不會回來）。
 */
export async function deleteSource(sourceId: string) {
  const { source } = await requireSourceOwner(sourceId);
  await prisma.skillSource.delete({ where: { id: source.id } });
  revalidatePath("/settings/repos");
}

export async function resyncSource(sourceId: string) {
  const { source } = await requireSourceOwner(sourceId);
  await syncSource(source.id);
  revalidatePath(`/settings/repos/${sourceId}`);
}
