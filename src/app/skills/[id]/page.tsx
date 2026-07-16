import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import matter from "gray-matter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { canViewSkill } from "@/lib/visibility";
import { AppHeader } from "@/components/AppHeader";

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/");

  const { id } = await params;
  if (!(await canViewSkill(id, viewer))) notFound();

  const skill = await prisma.skill.findUniqueOrThrow({
    where: { id },
    include: {
      source: true,
      contentCache: { select: { filePath: true } },
    },
  });

  const skillMdPath =
    skill.path === "" ? "SKILL.md" : `${skill.path}/SKILL.md`;
  const skillMd = await prisma.skillContentCache.findUnique({
    where: { skillId_filePath: { skillId: skill.id, filePath: skillMdPath } },
  });

  // DESIGN.md §8：檢視也要寫入稽核 log
  await prisma.accessAuditLog.create({
    data: { actorUserId: viewer.userId, skillId: skill.id, action: "view" },
  });

  const isPublic = skill.source.visibility === "public";
  const githubUrl = `https://github.com/${skill.source.repoFullName}/tree/HEAD/${skill.path}`;

  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <AppHeader githubLogin={viewer.githubLogin} />

      <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">
        ← 回列表
      </Link>

      <h1 className="mt-4 text-2xl font-bold">{skill.name}</h1>
      {skill.description && (
        <p className="mt-2 text-gray-500">{skill.description}</p>
      )}

      <div className="mt-4 flex items-center gap-4 text-sm">
        {/* DESIGN.md §5：public 才給 GitHub 連結，private 走平台代理下載 */}
        {isPublic ? (
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            在 GitHub 上查看
          </a>
        ) : (
          <span className="text-gray-400">
            原始 repo 為私有，此內容由擁有者透過本平台分享
          </span>
        )}
        <a
          href={`/api/v1/skills/${skill.id}/download`}
          className="text-blue-600 hover:underline"
        >
          下載 skill
        </a>
      </div>

      {skillMd && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">SKILL.md</h2>
          {/* frontmatter（name/description）已經顯示在頁首，內文只渲染 body 避免重複 */}
          <div className="prose prose-sm max-w-none rounded-lg border border-gray-200 p-4 dark:prose-invert dark:border-gray-800">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {matter(skillMd.fileContent).content}
            </ReactMarkdown>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">檔案清單</h2>
        <ul className="space-y-1 text-sm font-mono text-gray-600 dark:text-gray-400">
          {skill.contentCache.map((f) => (
            <li key={f.filePath}>{f.filePath}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
