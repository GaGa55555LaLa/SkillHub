import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getOrgClient, listOrgMembers, listOrgTeams } from "@/lib/github";
import {
  updateShareMode,
  toggleSkillPublished,
  addShare,
  removeShare,
  resyncSource,
} from "@/lib/actions/repos";
import { AppHeader } from "@/components/AppHeader";

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
      skills: { include: { shares: true }, orderBy: { path: "asc" } },
      shares: { where: { skillId: null } },
    },
  });
  if (!source || source.ownerType !== "user" || source.ownerUserId !== viewer.userId) {
    notFound();
  }

  const orgClient = await getOrgClient();
  const org = process.env.GITHUB_ORG!;
  const [members, teams] = await Promise.all([
    listOrgMembers(orgClient, org),
    listOrgTeams(orgClient, org),
  ]);
  const memberById = new Map(members.map((m) => [m.id, m.login]));
  const teamById = new Map(teams.map((t) => [t.id, t.name]));

  function granteeLabel(granteeType: string, granteeId: bigint) {
    const id = Number(granteeId);
    if (granteeType === "user") return memberById.get(id) ?? `使用者 #${id}`;
    return teamById.get(id) ?? `Team #${id}`;
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <AppHeader githubLogin={viewer.githubLogin} />

      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{source.repoFullName}</h1>
        <form action={resyncSource.bind(null, source.id)}>
          <button
            type="submit"
            className="text-sm text-blue-600 hover:underline"
          >
            重新掃描
          </button>
        </form>
      </div>
      <p className="mb-8 text-sm text-gray-500">
        {source.visibility === "private" ? "私有 repo" : "公開 repo"}
        {source.lastSyncedAt &&
          `・上次掃描 ${source.lastSyncedAt.toLocaleString("zh-TW")}`}
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

      {/* repo 層級分享對象 */}
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">整個 repo 的分享對象</h2>
        <ShareList
          shares={source.shares}
          granteeLabel={granteeLabel}
          sourceId={source.id}
        />
        <ShareForm sourceId={source.id} members={members} teams={teams} />
      </section>

      {/* skill 清單 + 逐一發布 + 逐一分享 */}
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
                      {skill.isPublished ? "已發布（點擊隱藏）" : "未發布（點擊發布）"}
                    </button>
                  </form>
                )}
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
                <ShareList
                  shares={skill.shares}
                  granteeLabel={granteeLabel}
                  sourceId={source.id}
                />
                <ShareForm
                  sourceId={source.id}
                  skillId={skill.id}
                  members={members}
                  teams={teams}
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
  granteeLabel,
  sourceId,
}: {
  shares: { id: string; granteeType: string; granteeId: bigint }[];
  granteeLabel: (type: string, id: bigint) => string;
  sourceId: string;
}) {
  if (shares.length === 0) {
    return <p className="text-sm text-gray-400">尚未分享給任何人</p>;
  }
  return (
    <ul className="mb-2 flex flex-wrap gap-2">
      {shares.map((share) => (
        <li
          key={share.id}
          className="flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1 text-xs dark:border-gray-700"
        >
          <span>
            {share.granteeType === "team" ? "Team: " : ""}
            {granteeLabel(share.granteeType, share.granteeId)}
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

function ShareForm({
  sourceId,
  skillId,
  members,
  teams,
  compact,
}: {
  sourceId: string;
  skillId?: string;
  members: { id: number; login: string }[];
  teams: { id: number; slug: string; name: string }[];
  compact?: boolean;
}) {
  return (
    <form
      action={addShare.bind(null, sourceId)}
      className={`flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}
    >
      {skillId && <input type="hidden" name="skillId" value={skillId} />}
      {/* type 與 id 編碼在同一個 value 裡，避免兩個獨立 select 選到對不上的組合 */}
      <select
        name="grantee"
        className="min-w-[10rem] rounded border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-700"
      >
        <optgroup label="成員">
          {members.map((m) => (
            <option key={`user-${m.id}`} value={`user:${m.id}`}>
              {m.login}
            </option>
          ))}
        </optgroup>
        <optgroup label="Team">
          {teams.map((t) => (
            <option key={`team-${t.id}`} value={`team:${t.id}`}>
              {t.name}
            </option>
          ))}
        </optgroup>
      </select>
      <button
        type="submit"
        className="rounded border border-gray-300 px-2 py-1 hover:border-gray-500 dark:border-gray-700"
      >
        新增分享
      </button>
    </form>
  );
}
