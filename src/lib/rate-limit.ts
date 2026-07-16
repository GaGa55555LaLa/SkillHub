import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hashToken } from "@/lib/api-auth";

/**
 * DESIGN.md §8：REST API / MCP 加合理 rate limit，避免 token 外洩後被
 * 大量爬取。純記憶體實作，固定視窗計數器 —— 對單一長駐 process（例如
 * `next start` 或單一 serverless instance 保持溫機）夠用，但如果部署成
 * 多個各自獨立、頻繁冷啟動的 serverless instance，各 instance 的計數
 * 互不相通，實際限制會比設定值寬鬆。真的要在多 instance 環境下精準
 * 限流，之後要換成 Upstash Redis 之類的共享儲存（@upstash/ratelimit）。
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function sweepExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  // 機率性清理，避免 Map 隨著不同 key（不同 token/IP）無限增長
  if (Math.random() < 0.01) sweepExpired(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return { allowed: bucket.count <= opts.limit, resetAt: bucket.resetAt };
}

function rateLimitKeyFor(req: NextRequest): string {
  const authHeader = req.headers.get("authorization");
  if (authHeader) return `auth:${hashToken(authHeader)}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `ip:${ip}`;
}

/** 呼叫端在 route handler 最上面用，回傳非 null 就直接 return 那個 429 response。 */
export function enforceRateLimit(
  req: NextRequest,
  opts: { limit: number; windowMs: number }
): NextResponse | null {
  const key = rateLimitKeyFor(req);
  const result = checkRateLimit(key, opts);
  if (!result.allowed) {
    return NextResponse.json(
      { error: "rate limited, try again later" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)) },
      }
    );
  }
  return null;
}
