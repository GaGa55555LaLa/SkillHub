import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveApiViewer } from "@/lib/api-auth";
import { canViewSkill } from "@/lib/visibility";
import { enforceRateLimit } from "@/lib/rate-limit";

/** GET /api/v1/skills/:id — DESIGN.md §9 get_skill_details */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = enforceRateLimit(req, { limit: 60, windowMs: 60_000 });
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
    include: { contentCache: { select: { filePath: true } } },
  });

  const skillMdPath =
    skill.path === "" ? "SKILL.md" : `${skill.path}/SKILL.md`;
  const skillMd = await prisma.skillContentCache.findUnique({
    where: { skillId_filePath: { skillId: skill.id, filePath: skillMdPath } },
  });

  await prisma.accessAuditLog.create({
    data: { actorUserId: viewer.userId, skillId: skill.id, action: "view" },
  });

  return NextResponse.json({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    skill_md_content: skillMd?.fileContent ?? null,
    file_list: skill.contentCache.map((f) => f.filePath),
  });
}
