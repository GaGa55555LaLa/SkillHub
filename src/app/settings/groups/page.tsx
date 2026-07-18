import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { AppHeader } from "@/components/AppHeader";
import { BUTTON_LINK_CLASS } from "@/lib/ui";
import {
  createGroup,
  deleteGroup,
  removeGroupMember,
} from "@/lib/actions/groups";
import { GroupMemberForm } from "@/components/GroupMemberForm";

export default async function GroupsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");

  const groups = await prisma.group.findMany({
    where: { ownerUserId: viewer.userId },
    include: { members: { include: { user: true } } },
    orderBy: { createdAt: "asc" },
  });

  // 平台已知使用者,給 username 輸入框的建議下拉(含頭貼)——
  // 仍可自由輸入清單外的 GitHub username(見 repos/[id] 頁的同款作法)。
  const platformUsers = (
    await prisma.user.findMany({
      where: { NOT: { id: viewer.userId } },
      select: { githubLogin: true, githubAvatarUrl: true },
      orderBy: { githubLogin: "asc" },
    })
  ).map((u) => ({ login: u.githubLogin, avatarUrl: u.githubAvatarUrl }));

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <AppHeader githubLogin={viewer.githubLogin} />

      <h1 className="mb-2 text-2xl font-bold">我的群組</h1>
      <p className="mb-6 text-sm text-gray-500">
        群組用來當分享對象。輸入對方的 GitHub username
        即可加入（對方不需同意，被加入只是獲得觀看你分享內容的權利）。
        分享 skill 時只能選自己建立的群組。
      </p>

      <form action={createGroup} className="mb-8 flex items-center gap-2">
        <input
          type="text"
          name="name"
          required
          placeholder="新群組名稱…"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button type="submit" className={BUTTON_LINK_CLASS}>
          建立群組
        </button>
      </form>

      {groups.length === 0 ? (
        <p className="text-gray-500">還沒有任何群組。</p>
      ) : (
        <ul className="space-y-6">
          {groups.map((group) => (
            <li
              key={group.id}
              className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-semibold">{group.name}</span>
                <form action={deleteGroup.bind(null, group.id)}>
                  <button
                    type="submit"
                    className="text-sm text-red-500 hover:underline"
                  >
                    刪除群組
                  </button>
                </form>
              </div>

              {group.members.length === 0 ? (
                <p className="mb-2 text-sm text-gray-400">尚無成員</p>
              ) : (
                <ul className="mb-3 flex flex-wrap gap-2">
                  {group.members.map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1 text-xs dark:border-gray-700"
                    >
                      {member.user.githubAvatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={member.user.githubAvatarUrl}
                          alt=""
                          className="h-4 w-4 rounded-full"
                        />
                      )}
                      <span>{member.user.githubLogin}</span>
                      <form
                        action={removeGroupMember.bind(null, group.id, member.id)}
                      >
                        <button
                          type="submit"
                          className="text-gray-400 hover:text-red-500"
                          aria-label="移除成員"
                        >
                          ×
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <GroupMemberForm groupId={group.id} users={platformUsers} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
