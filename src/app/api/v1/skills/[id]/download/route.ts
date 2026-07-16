import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveApiViewer } from "@/lib/api-auth";
import { canViewSkill } from "@/lib/visibility";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/v1/skills/:id/download — DESIGN.md §9 download_skill
 * 直接回傳檔案內容陣列（非 zip），方便 agent 寫入本地 .claude/skills/<name>/。
 * 路徑會轉成相對於 skill 資料夾的相對路徑。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 下載內容較重，限制比 search/details 嚴一點
  const limited = enforceRateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const viewer = await resolveApiViewer(req);
  if (!viewer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await canViewSkill(id, viewer))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const skill = await prisma.skill.findUniqueOrThrow({
    where: { id },
    include: { contentCache: true },
  });

  await prisma.accessAuditLog.create({
    data: { actorUserId: viewer.userId, skillId: skill.id, action: "download" },
  });

  const prefix = skill.path === "" ? "" : `${skill.path}/`;
  return NextResponse.json({
    name: skill.name,
    files: skill.contentCache.map((f) => ({
      path: f.filePath.startsWith(prefix)
        ? f.filePath.slice(prefix.length)
        : f.filePath,
      content: f.fileContent,
    })),
  });
}
