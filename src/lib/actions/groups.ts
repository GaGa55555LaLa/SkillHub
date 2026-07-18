"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getUserByLogin } from "@/lib/github";

async function requireGroupOwner(groupId: string) {
  const viewer = await getViewer();
  if (!viewer) throw new Error("unauthorized");

  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
  });
  if (group.ownerUserId !== viewer.userId) throw new Error("forbidden");
  return { viewer, group };
}

/**
 * 把 GitHub username 解析成平台 user（DESIGN.md §4）。
 * 對方還沒登入過平台時建 placeholder，之後首次登入以 githubId 對上同一筆。
 */
export async function resolvePlatformUser(username: string) {
  const ghUser = await getUserByLogin(username.trim());
  if (!ghUser) return null;

  return prisma.user.upsert({
    where: { githubId: BigInt(ghUser.githubId) },
    update: { githubLogin: ghUser.login, githubAvatarUrl: ghUser.avatarUrl },
    create: {
      githubId: BigInt(ghUser.githubId),
      githubLogin: ghUser.login,
      githubAvatarUrl: ghUser.avatarUrl,
    },
  });
}

export async function createGroup(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) throw new Error("unauthorized");

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("group name required");
  }

  const existing = await prisma.group.findUnique({
    where: {
      ownerUserId_name: { ownerUserId: viewer.userId, name: name.trim() },
    },
  });
  if (!existing) {
    await prisma.group.create({
      data: { name: name.trim(), ownerUserId: viewer.userId },
    });
  }
  revalidatePath("/settings/groups");
}

export async function deleteGroup(groupId: string) {
  await requireGroupOwner(groupId);
  // cascade 會一併清掉 group_members 與指向此群組的 skill_shares
  await prisma.group.delete({ where: { id: groupId } });
  revalidatePath("/settings/groups");
}

/**
 * 加群組成員。給 useActionState 用：成功回 null，失敗回 { error }。
 */
export async function addGroupMember(
  groupId: string,
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const { group } = await requireGroupOwner(groupId);

  const username = formData.get("username");
  if (typeof username !== "string" || !username.trim()) {
    return { error: "請輸入 username" };
  }

  const user = await resolvePlatformUser(username);
  console.log(
    `[group] group=${group.name} username=${username.trim()} ` +
      `resolved=${user?.githubLogin ?? "NOT_FOUND"}`
  );
  if (!user) {
    return { error: `GitHub 上找不到帳號「${username.trim()}」` };
  }

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
  });
  if (!existing) {
    await prisma.groupMember.create({
      data: { groupId: group.id, userId: user.id },
    });
  }
  revalidatePath("/settings/groups");
  return null;
}

export async function removeGroupMember(groupId: string, memberId: string) {
  const { group } = await requireGroupOwner(groupId);
  await prisma.groupMember.deleteMany({
    where: { id: memberId, groupId: group.id },
  });
  revalidatePath("/settings/groups");
}
