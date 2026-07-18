import { NextRequest, NextResponse } from "next/server";
import { Webhooks } from "@octokit/webhooks";
import { prisma } from "@/lib/prisma";
import { syncSource } from "@/lib/sync";

let webhooks: Webhooks | undefined;

function getWebhooks(): Webhooks {
  webhooks ??= new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET! });
  return webhooks;
}

/**
 * DESIGN.md §3：push event 觸發該 repo 重新掃描（排程 sync 為保底）。
 * 另外處理 GitHub 端的解除授權，讓平台不留殭屍連結：
 * - installation deleted：使用者把整個 App 解除安裝
 * - installation_repositories removed：使用者從安裝中移除部分 repo
 * 兩者都刪掉對應的 skill_source（cascade 一併清 skills、快取、分享）。
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  if (!(await getWebhooks().verify(body, signature))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event === "push") {
    const payload = JSON.parse(body) as {
      repository?: { full_name?: string };
    };
    const repoFullName = payload.repository?.full_name;
    if (repoFullName) {
      const source = await prisma.skillSource.findUnique({
        where: { repoFullName },
      });
      if (source) {
        await syncSource(source.id);
      }
    }
  } else if (event === "installation") {
    const payload = JSON.parse(body) as {
      action?: string;
      installation?: { id?: number };
    };
    if (payload.action === "deleted" && payload.installation?.id) {
      await prisma.skillSource.deleteMany({
        where: { installationId: BigInt(payload.installation.id) },
      });
    }
  } else if (event === "installation_repositories") {
    const payload = JSON.parse(body) as {
      action?: string;
      installation?: { id?: number };
      repositories_removed?: { full_name?: string }[];
    };
    const removed = (payload.repositories_removed ?? [])
      .map((repo) => repo.full_name)
      .filter((name): name is string => Boolean(name));
    if (payload.action === "removed" && payload.installation?.id && removed.length > 0) {
      await prisma.skillSource.deleteMany({
        where: {
          installationId: BigInt(payload.installation.id),
          repoFullName: { in: removed },
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
