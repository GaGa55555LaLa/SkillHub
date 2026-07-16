import { NextRequest, NextResponse } from "next/server";
import { Webhooks } from "@octokit/webhooks";
import { prisma } from "@/lib/prisma";
import { syncUserSource } from "@/lib/sync";

let webhooks: Webhooks | undefined;

function getWebhooks(): Webhooks {
  webhooks ??= new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET! });
  return webhooks;
}

/**
 * DESIGN.md §3：push event 觸發該 repo 重新掃描（排程 sync 為保底）。
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
        await syncUserSource(source.id);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
