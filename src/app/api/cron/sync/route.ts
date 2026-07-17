import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSource } from "@/lib/sync";

/**
 * DESIGN.md §3（v2）：排程 sync，webhook 的保底機制。用 Vercel Cron 呼叫
 * （vercel.json 設定排程），Vercel 會自動帶上
 * `Authorization: Bearer ${CRON_SECRET}`，這裡驗證同一組密鑰。
 * 沒有部署在 Vercel 的話，任何排程器只要帶同樣的 header 都可以打。
 *
 * 遍歷所有已連結的來源；syncSource 內部會先比對 head sha，
 * 沒變動的 repo 幾乎零成本。
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: { repoFullName: string; status: "ok" | "error" }[] = [];

  const sources = await prisma.skillSource.findMany({
    select: { id: true, repoFullName: true },
  });
  for (const source of sources) {
    try {
      await syncSource(source.id);
      results.push({ repoFullName: source.repoFullName, status: "ok" });
    } catch (err) {
      console.error(`cron sync: ${source.repoFullName} failed`, err);
      results.push({ repoFullName: source.repoFullName, status: "error" });
    }
  }

  return NextResponse.json({ sources: results });
}
