import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { visibleSkillsWhere } from "@/lib/visibility";
import { AppHeader } from "@/components/AppHeader";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/");

  const { q } = await searchParams;
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
    include: { source: true },
    orderBy: { updatedAt: "desc" },
  });

  // 下載次數：MCP 的 download_skill 與網頁「下載」按鈕都走同一支
  // /api/v1/skills/:id/download，都寫入 access_audit_log(action=download)，
  // 所以這裡直接數 audit log 就同時涵蓋兩種來源。
  const downloadCounts = await prisma.accessAuditLog.groupBy({
    by: ["skillId"],
    where: {
      action: "download",
      skillId: { in: skills.map((s) => s.id) },
    },
    _count: { skillId: true },
  });
  const downloadCountBySkill = new Map(
    downloadCounts.map((row) => [row.skillId, row._count.skillId])
  );

  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <AppHeader githubLogin={viewer.githubLogin} />

      <h1 className="mb-6 text-2xl font-bold">Skills</h1>

      <form className="mb-6">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="搜尋 skill 名稱或描述…"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </form>

      {skills.length === 0 ? (
        <p className="text-gray-500">目前沒有可見的 skill。</p>
      ) : (
        <ul className="space-y-3">
          {skills.map((skill) => (
            <li key={skill.id}>
              <Link
                href={`/skills/${skill.id}`}
                className="block rounded-lg border border-gray-200 p-4 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{skill.name}</span>
                  <span className="text-xs text-gray-400">
                    {skill.source.ownerUserId === viewer.userId
                      ? "我的"
                      : skill.isPublic || skill.source.isPublic
                        ? "公開"
                        : "分享給我"}
                    ・{skill.source.repoFullName}
                  </span>
                </div>
                {skill.description && (
                  <p className="mt-1 text-sm text-gray-500">
                    {skill.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-gray-400">
                  ↓ {downloadCountBySkill.get(skill.id) ?? 0} 次下載
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
