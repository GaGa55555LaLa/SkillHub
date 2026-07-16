import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveApiViewer } from "@/lib/api-auth";
import { visibleSkillsWhere } from "@/lib/visibility";
import { enforceRateLimit } from "@/lib/rate-limit";

/** GET /api/v1/skills/search?q=... — DESIGN.md §9 search_skills */
export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const viewer = await resolveApiViewer(req);
  if (!viewer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const skills = await prisma.skill.findMany({
    where: {
      AND: [
        visibleSkillsWhere(viewer),
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    include: { source: { include: { owner: true } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      owner: s.source.owner?.githubLogin ?? s.source.repoFullName.split("/")[0],
      source_type: s.source.ownerType,
    })),
  });
}
