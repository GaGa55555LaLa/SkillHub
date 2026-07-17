import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">SkillHub</h1>
      <p className="text-gray-500">
        Skills 共享平台 — 用 GitHub 帳號登入，連結你的 repo、分享給群組或個人
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/dashboard" });
        }}
      >
        <button
          type="submit"
          className="rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          使用 GitHub 登入
        </button>
      </form>
    </main>
  );
}
