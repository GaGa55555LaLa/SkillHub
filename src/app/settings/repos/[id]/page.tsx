import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import {
  updateShareMode,
  toggleSkillPublished,
  toggleSourcePublic,
  toggleSkillPublic,
  addGroupShare,
  addUserShare,
  removeShare,
  resyncSource,
} from "@/lib/actions/repos";
import { AppHeader } from "@/components/AppHeader";
import { BUTTON_LINK_CLASS } from "@/lib/ui";

type ShareWithGrantee = {
  id: string;
  granteeUser: { githubLogin: string } | null;
  granteeGroup: { name: string } | null;
};

export default async function RepoSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/");

  const { id } = await params;
  const source = await prisma.skillSource.findUnique({
    where: { id },
    include: {
      skills: {
        include: {
          shares: { include: { granteeUser: true, granteeGroup: true } },
        },
        orderBy: { path: "asc" },
      },
      shares: {
        where: { skillId: null },
        include: { granteeUser: true, granteeGroup: true },
      },
    },
  });
  if (!source || source.ownerUserId !== viewer.userId) {
    notFound();
  }

  const myGroups = await prisma.group.findMany({
    where: { ownerUserId: viewer.userId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <AppHeader githubLogin={viewer.githubLogin} />

      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{source.repoFullName}</h1>
        <form action={resyncSource.bind(null, source.id)}>
          <button type="submit" className={BUTTON_LINK_CLASS}>
            重新掃描
          </button>
        </form>
      </div>
      <p className="mb-8 text-sm text-gray-500">
        {source.visibility === "private" ? "私有 repo" : "公開 repo"}
        {source.lastSyncedAt &&
          `・上次掃描 ${source.lastSyncedAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`}
      </p>

      {/* share_mode 切換 */}
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">曝光模式</h2>
        <form
          action={updateShareMode.bind(null, source.id)}
          className="flex flex-col gap-2 text-sm"
        >
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="shareMode"
              value="whole_repo"
              defaultChecked={source.shareMode === "whole_repo"}
            />
            整包分享 — repo 內所有 skill（含未來新增的）都套用同一組分享設定
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="shareMode"
              value="selected_only"
              defaultChecked={source.shareMode === "selected_only"}
            />
            逐一挑選 — 只有手動勾選「已發布」的 skill 才會曝光
          </label>
          <button
            type="submit"
            className="mt-1 w-fit rounded-lg border border-gray-300 px-3 py-1.5 hover:border-gray-500 dark:border-gray-700"
          >
            儲存
          </button>
        </form>
      </section>

      {/* repo 層級：平台公開 + 分享對象 */}
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">整個 repo 的分享設定</h2>

        <form
          action={toggleSourcePublic.bind(null, source.id)}
          className="mb-3"
        >
          <input
            type="hidden"
            name="isPublic"
            value={(!source.isPublic).toString()}
          />
          <button
            type="submit"
            className={`rounded-full px-3 py-1 text-xs ${
              source.isPublic
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {source.isPublic
              ? "已公開給平台所有人（點擊改回私有）"
              : "未公開（點擊公開給平台所有人）"}
          </button>
        </form>
        {source.isPublic && (
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
            注意：任何人都能註冊本平台，公開實質等於全世界可見。
          </p>
        )}

        <ShareList shares={source.shares} sourceId={source.id} />
        <ShareForms sourceId={source.id} groups={myGroups} />
      </section>

      {/* skill 清單 + 逐一發布/公開 + 逐一分享 */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Skills</h2>
        <ul className="space-y-4">
          {source.skills.map((skill) => (
            <li
              key={skill.id}
              className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{skill.name}</span>
                  {skill.path && (
                    <span className="ml-2 text-xs text-gray-400">
                      {skill.path}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {source.shareMode === "selected_only" && (
                    <form
                      action={toggleSkillPublished.bind(null, source.id, skill.id)}
                    >
                      <input
                        type="hidden"
                        name="isPublished"
                        value={(!skill.isPublished).toString()}
                      />
                      <button
                        type="submit"
                        className={`rounded-full px-3 py-1 text-xs ${
                          skill.isPublished
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                        }`}
                      >
                        {skill.isPublished ? "已發布" : "未發布"}
                      </button>
                    </form>
                  )}
                  <form
                    action={toggleSkillPublic.bind(null, source.id, skill.id)}
                  >
                    <input
                      type="hidden"
                      name="isPublic"
                      value={(!skill.isPublic).toString()}
                    />
                    <button
                      type="submit"
                      className={`rounded-full px-3 py-1 text-xs ${
                        skill.isPublic
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {skill.isPublic ? "已公開" : "未公開"}
                    </button>
                  </form>
                </div>
              </div>
              {skill.description && (
                <p className="mt-1 text-sm text-gray-500">
                  {skill.description}
                </p>
              )}

              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-gray-500">
                  只分享此 skill 給：
                </p>
                <ShareList shares={skill.shares} sourceId={source.id} />
                <ShareForms
                  sourceId={source.id}
                  skillId={skill.id}
                  groups={myGroups}
                  compact
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function ShareList({
  shares,
  sourceId,
}: {
  shares: ShareWithGrantee[];
  sourceId: string;
}) {
  if (shares.length === 0) {
    return <p className="mb-2 text-sm text-gray-400">尚未分享給任何人</p>;
  }
  return (
    <ul className="mb-2 flex flex-wrap gap-2">
      {shares.map((share) => (
        <li
          key={share.id}
          className="flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1 text-xs dark:border-gray-700"
        >
          <span>
            {share.granteeGroup
              ? `群組: ${share.granteeGroup.name}`
              : share.granteeUser?.githubLogin ?? "?"}
          </span>
          <form action={removeShare.bind(null, sourceId, share.id)}>
            <button
              type="submit"
              className="text-gray-400 hover:text-red-500"
              aria-label="移除分享"
            >
              ×
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function ShareForms({
  sourceId,
  skillId,
  groups,
  compact,
}: {
  sourceId: string;
  skillId?: string;
  groups: { id: string; name: string }[];
  compact?: boolean;
}) {
  const sizeClass = compact ? "text-xs" : "text-sm";
  return (
    <div className={`flex flex-wrap items-center gap-3 ${sizeClass}`}>
      {groups.length > 0 && (
        <form
          action={addGroupShare.bind(null, sourceId)}
          className="flex items-center gap-2"
        >
          {skillId && <input type="hidden" name="skillId" value={skillId} />}
          <select
            name="groupId"
            className="rounded border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-700"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-gray-300 px-2 py-1 hover:border-gray-500 dark:border-gray-700"
          >
            分享給群組
          </button>
        </form>
      )}
      <form
        action={addUserShare.bind(null, sourceId)}
        className="flex items-center gap-2"
      >
        {skillId && <input type="hidden" name="skillId" value={skillId} />}
        <input
          type="text"
          name="username"
          required
          placeholder="GitHub username…"
          className="w-40 rounded border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-700"
        />
        <button
          type="submit"
          className="rounded border border-gray-300 px-2 py-1 hover:border-gray-500 dark:border-gray-700"
        >
          分享給個人
        </button>
      </form>
    </div>
  );
}
