import { createHash, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer, buildViewer, type Viewer } from "@/lib/viewer";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 產生一組 API token（一次性顯示明碼，DB 只存雜湊）。 */
export async function createApiToken(userId: string) {
  const token = `skh_${randomBytes(32).toString("hex")}`;
  await prisma.apiToken.create({
    data: { userId, tokenHash: hashToken(token) },
  });
  return token;
}

/**
 * REST API 的身份解析：先看 Bearer token（MCP / CLI 使用），
 * 沒有的話退回 session（瀏覽器直接點下載連結）。
 * DESIGN.md §9：token 綁定使用者身份，可見性判斷與網站完全一致。
 */
export async function resolveApiViewer(
  req: NextRequest
): Promise<Viewer | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const record = await prisma.apiToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!record || record.revokedAt) return null;

    await prisma.apiToken.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });

    return buildViewer(record.user);
  }

  return getViewer();
}
