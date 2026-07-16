import Link from "next/link";

export function AppHeader({ githubLogin }: { githubLogin: string }) {
  return (
    <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
      <Link href="/dashboard" className="text-lg font-bold hover:opacity-80">
        SkillHub
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/settings/repos" className="text-blue-600 hover:underline">
          我的 repo
        </Link>
        <Link href="/settings/tokens" className="text-blue-600 hover:underline">
          API Tokens
        </Link>
        <span className="text-gray-500">@{githubLogin}</span>
      </div>
    </div>
  );
}
