import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { revokeApiToken } from "@/lib/actions/tokens";
import { CreateTokenForm } from "./CreateTokenForm";
import { McpGuide } from "./McpGuide";
import { AppHeader } from "@/components/AppHeader";

export default async function TokensPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");

  const tokens = await prisma.apiToken.findMany({
    where: { userId: viewer.userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <AppHeader githubLogin={viewer.githubLogin} />

      <h1 className="mb-2 text-2xl font-bold">API Tokens</h1>
      <p className="mb-6 text-sm text-gray-500">
        給 MCP / CLI 串接用。每個 token 綁定你的身份，能看到的 skill 跟你在
        網站上看到的完全一致。
      </p>

      <CreateTokenForm />

      {tokens.length === 0 ? (
        <p className="text-gray-500">還沒有任何 token。</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-gray-500">
            <tr>
              <th className="pb-2">建立時間</th>
              <th className="pb-2">上次使用</th>
              <th className="pb-2">狀態</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr
                key={token.id}
                className="border-t border-gray-200 dark:border-gray-800"
              >
                <td className="py-2">
                  {token.createdAt.toLocaleString("zh-TW")}
                </td>
                <td className="py-2">
                  {token.lastUsedAt
                    ? token.lastUsedAt.toLocaleString("zh-TW")
                    : "尚未使用"}
                </td>
                <td className="py-2">
                  {token.revokedAt ? (
                    <span className="text-gray-400">已撤銷</span>
                  ) : (
                    <span className="text-green-600 dark:text-green-400">
                      有效
                    </span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {!token.revokedAt && (
                    <form action={revokeApiToken.bind(null, token.id)}>
                      <button
                        type="submit"
                        className="text-red-500 hover:underline"
                      >
                        撤銷
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <McpGuide />
    </main>
  );
}
