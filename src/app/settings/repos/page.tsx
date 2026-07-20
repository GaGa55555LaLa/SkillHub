import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getAppSlug } from "@/lib/github";
import { deleteSource } from "@/lib/actions/repos";
import { AppHeader } from "@/components/AppHeader";

export default async function MyReposPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");

  const [sources, appSlug] = await Promise.all([
    prisma.skillSource.findMany({
      where: { ownerUserId: viewer.userId },
      include: { skills: true },
      orderBy: { createdAt: "desc" },
    }),
    getAppSlug(),
  ]);

  const installUrl = `https://github.com/apps/${appSlug}/installations/new`;

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <AppHeader githubLogin={viewer.githubLogin} />

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的 repo</h1>
        <a
          href={installUrl}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          連結我的 repo
        </a>
      </div>

      <p className="mb-6 text-sm text-gray-500">
        連結後預設不會分享給任何人，需要進到各 repo 的設定頁挑選要曝光哪些
        skill、要分享給誰。
      </p>

      {sources.length === 0 ? (
        <p className="text-gray-500">還沒有連結任何個人 repo。</p>
      ) : (
        <ul className="space-y-3">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-4 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
            >
              <Link
                href={`/settings/repos/${source.id}`}
                className="min-w-0 flex-1"
              >
                <span className="font-semibold">{source.repoFullName}</span>
                <p className="mt-1 text-sm text-gray-500">
                  {source.skills.length} 個 skill・
                  {source.shareMode === "whole_repo"
                    ? source.isPublic
                      ? source.skills.length
                      : 0
                    : source.skills.filter((s) => s.isPublic).length}{" "}
                  個已公開
                </p>
              </Link>
              <div className="flex flex-col items-end gap-2">
                <span className="text-xs text-gray-400">
                  {source.visibility === "private" ? "私有" : "公開"}・
                  {source.shareMode === "whole_repo" ? "整包分享" : "逐一挑選"}
                </span>
                <form action={deleteSource.bind(null, source.id)}>
                  <button
                    type="submit"
                    className="text-sm text-red-500 hover:underline"
                  >
                    刪除
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
