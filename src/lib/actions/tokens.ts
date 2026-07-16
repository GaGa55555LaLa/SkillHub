"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { createApiToken } from "@/lib/api-auth";

/**
 * 產生新 token。回傳明碼給呼叫端（React useActionState）在畫面上
 * 顯示一次，DB 從頭到尾只存雜湊，這裡的回傳值也不會再有第二次機會。
 */
export async function createApiTokenAction(): Promise<
  { token: string } | { error: string }
> {
  const viewer = await getViewer();
  if (!viewer) return { error: "unauthorized" };

  const token = await createApiToken(viewer.userId);
  revalidatePath("/settings/tokens");
  return { token };
}

export async function revokeApiToken(tokenId: string) {
  const viewer = await getViewer();
  if (!viewer) throw new Error("unauthorized");

  await prisma.apiToken.updateMany({
    where: { id: tokenId, userId: viewer.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings/tokens");
}
