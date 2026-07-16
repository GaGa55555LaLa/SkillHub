import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { listInstallationRepos } from "@/lib/github";
import { syncUserSource } from "@/lib/sync";

/**
 * GitHub App 的 Setup URL（要在 GitHub App 設定頁手動填成
 * `<host>/api/github/setup`）。使用者在 GitHub 上把 App 裝到自己的
 * 個人帳號、選好要授權的 repo 後，GitHub 會把瀏覽器導回這裡並帶上
 * installation_id。因為是同一個瀏覽器的完整往返，平台的登入 session
 * 會原封不動保留，不需要額外的 state 參數就能知道是哪個使用者連結的。
 * DESIGN.md §2.3。
 */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.redirect(new URL("/?error=login_required", req.url));
  }

  const installationId = req.nextUrl.searchParams.get("installation_id");
  if (!installationId) {
    return NextResponse.redirect(new URL("/settings/repos", req.url));
  }

  const repos = await listInstallationRepos(Number(installationId));
  for (const repo of repos) {
    const source = await prisma.skillSource.upsert({
      where: { repoFullName: repo.fullName },
      update: {
        installationId: BigInt(installationId),
        visibility: repo.private ? "private" : "public",
      },
      create: {
        repoFullName: repo.fullName,
        ownerType: "user",
        ownerUserId: viewer.userId,
        installationId: BigInt(installationId),
        visibility: repo.private ? "private" : "public",
        // 個人 repo 預設 selected_only：連結完不會自動曝光任何 skill，
        // 需要使用者自己去分享設定頁勾選要發布哪些（DESIGN.md §3.2）。
        shareMode: "selected_only",
      },
    });
    await syncUserSource(source.id);
  }

  return NextResponse.redirect(new URL("/settings/repos", req.url));
}
