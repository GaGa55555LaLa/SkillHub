import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { visibleSkillsWhere } from "@/lib/visibility";

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

  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Skills</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/settings/repos" className="text-blue-600 hover:underline">
            我的 repo
          </Link>
          <span className="text-gray-500">@{viewer.githubLogin}</span>
        </div>
      </div>

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
                    {skill.source.ownerType === "org"
                      ? "Org"
                      : "個人分享"}
                    ・{skill.source.repoFullName}
                  </span>
                </div>
                {skill.description && (
                  <p className="mt-1 text-sm text-gray-500">
                    {skill.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
