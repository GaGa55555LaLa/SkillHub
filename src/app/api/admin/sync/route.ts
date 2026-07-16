import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { syncOrgInstallation } from "@/lib/sync";

const DEBOUNCE_MS = 5 * 60 * 1000;

/**
 * POST /api/admin/sync — DESIGN.md §3.1 Admin 手動「立即刷新」。
 * 5 分鐘防抖，避免誤觸浪費 GitHub API quota。
 * Admin 名單先用環境變數 ADMIN_LOGINS（逗號分隔）管理。
 */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admins = (process.env.ADMIN_LOGINS ?? "").split(",").map((s) => s.trim());
  if (!admins.includes(viewer.githubLogin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const lastSync = await prisma.skillSource.aggregate({
    where: { ownerType: "org" },
    _max: { lastSyncedAt: true },
  });
  const last = lastSync._max.lastSyncedAt;
  if (last && Date.now() - last.getTime() < DEBOUNCE_MS) {
    return NextResponse.json(
      { error: "too many requests, try again later" },
      { status: 429 }
    );
  }

  const orgInstallationId = process.env.GITHUB_ORG_INSTALLATION_ID;
  if (!orgInstallationId) {
    return NextResponse.json(
      { error: "GITHUB_ORG_INSTALLATION_ID not configured" },
      { status: 500 }
    );
  }

  await syncOrgInstallation(BigInt(orgInstallationId));
  return NextResponse.json({ ok: true });
}
