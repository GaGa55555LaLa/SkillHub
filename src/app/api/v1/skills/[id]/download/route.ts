import { NextRequest, NextResponse } from "next/server";
import { zipSync, strToU8 } from "fflate";
import { prisma } from "@/lib/prisma";
import { resolveApiViewer } from "@/lib/api-auth";
import { canViewSkill } from "@/lib/visibility";
import { enforceRateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/slug";

/**
 * GET /api/v1/skills/:id/download — DESIGN.md §9 download_skill
 * 預設回傳檔案內容陣列（非 zip），方便 agent 寫入本地 .claude/skills/<dir>/。
 * 帶 ?format=zip 則回傳 zip 檔（Content-Disposition: attachment）——給
 * 瀏覽器上的「下載」按鈕用，JSON 對瀏覽器來說不是真的下載。
 * 路徑會轉成相對於 skill 資料夾的相對路徑。
 *
 * `name` 只是從 SKILL.md frontmatter 解析出來的顯示字串，不保證唯一
 * ——不同人各自 fork 同一個公開範本很容易撞名。所以另外給一個
 * `suggested_dir_name`（owner-name slug）給呼叫端當本地資料夾名稱，
 * 避免不同來源、同名的 skill 互相覆蓋。
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
    include: { contentCache: true, source: { include: { owner: true } } },
  });

  await prisma.accessAuditLog.create({
    data: { actorUserId: viewer.userId, skillId: skill.id, action: "download" },
  });

  const owner =
    skill.source.owner?.githubLogin ?? skill.source.repoFullName.split("/")[0];
  const suggestedDirName = `${slugify(owner)}-${slugify(skill.name)}`;

  const prefix = skill.path === "" ? "" : `${skill.path}/`;
  const files = skill.contentCache.map((f) => ({
    path: f.filePath.startsWith(prefix)
      ? f.filePath.slice(prefix.length)
      : f.filePath,
    content: f.fileContent,
  }));

  if (req.nextUrl.searchParams.get("format") === "zip") {
    const zipped = zipSync(
      Object.fromEntries(
        files.map((f) => [`${suggestedDirName}/${f.path}`, strToU8(f.content)])
      )
    );
    return new NextResponse(Buffer.from(zipped), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${suggestedDirName}.zip"`,
      },
    });
  }

  return NextResponse.json({
    name: skill.name,
    owner,
    suggested_dir_name: suggestedDirName,
    files,
  });
}
