import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncOrgInstallation, syncUserSource } from "@/lib/sync";

/**
 * DESIGN.md §3：排程 sync，webhook 的保底機制。用 Vercel Cron 呼叫
 * （vercel.json 設定排程），Vercel 會自動帶上
 * `Authorization: Bearer ${CRON_SECRET}`，這裡驗證同一組密鑰。
 * 沒有部署在 Vercel 的話，任何排程器（cron / GitHub Actions schedule）
 * 只要帶同樣的 header 打這支 API 都可以。
 *
 * 掃描範圍涵蓋 org（來源一）與所有已連結的個人 repo（來源二）；
 * org 的 sha diff 已經在 syncOrgInstallation 內做，個人 repo 逐一呼叫
 * syncUserSource 也一樣會先比對 head sha，沒變動的 repo 幾乎零成本。
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: {
    org?: "ok" | "skipped" | "error";
    userSources: { repoFullName: string; status: "ok" | "error" }[];
  } = { userSources: [] };

  const orgInstallationId = process.env.GITHUB_ORG_INSTALLATION_ID;
  if (orgInstallationId) {
    try {
      await syncOrgInstallation(BigInt(orgInstallationId));
      results.org = "ok";
    } catch (err) {
      console.error("cron sync: org sync failed", err);
      results.org = "error";
    }
  } else {
    results.org = "skipped";
  }

  const userSources = await prisma.skillSource.findMany({
    where: { ownerType: "user" },
    select: { id: true, repoFullName: true },
  });
  for (const source of userSources) {
    try {
      await syncUserSource(source.id);
      results.userSources.push({ repoFullName: source.repoFullName, status: "ok" });
    } catch (err) {
      console.error(`cron sync: user source ${source.repoFullName} failed`, err);
      results.userSources.push({ repoFullName: source.repoFullName, status: "error" });
    }
  }

  return NextResponse.json(results);
}
