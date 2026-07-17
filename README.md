# SkillHub — Skills 共享平台

任何 GitHub 使用者都能登入，連結自己的 repo、上傳 skills（Claude Skills 格式）、
分享給自建群組或個人，或公開給平台所有人。完整設計見 [DESIGN.md](./DESIGN.md)（v2）。

## 架構

- **主站**（本目錄）：Next.js App Router + Prisma (Postgres) + Auth.js
  - GitHub OAuth 登入，任何帳號皆可（`src/auth.ts`）
  - GitHub App 掃描使用者連結 repo 內的 `SKILL.md` 資料夾（`src/lib/github.ts`、`src/lib/sync.ts`）
  - 可見性判斷邏輯（`src/lib/visibility.ts`，DESIGN.md §6.1）：
    公開 ∪ 個人分享 ∪ 群組分享 ∪ 自己的
  - 群組管理（`/settings/groups`，`src/lib/actions/groups.ts`）
  - repo 連結（`/settings/repos`、`/api/github/setup`）+ 分享/公開設定
    （`/settings/repos/[id]`，`src/lib/actions/repos.ts`）
  - REST API：`/api/v1/skills/search`、`/api/v1/skills/:id`、`/api/v1/skills/:id/download`
  - 排程 sync（`/api/cron/sync`，`vercel.json` 設定每小時觸發一次）
- **MCP server**（`mcp-server/`）：Streamable HTTP remote MCP，
  提供 `search_skills` / `get_skill_details` / `download_skill` 三個工具，
  內部轉呼叫主站 REST API。
- **Bootstrap skills**（`skills/`）：`skillsharing-find`、`skillsharing-download`，
  讓 Claude 不經 MCP、直接用 curl 串 REST API。

## 開發環境設定

1. 複製環境變數範本並填入：

   ```bash
   cp .env.example .env
   ```

   需要事先建立：
   - **GitHub OAuth App**（登入用）→ `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`
     - Authorization callback URL：`<host>/api/auth/callback/github`
   - **GitHub App**（讀 repo 用）→ `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY`
     - **Where can this GitHub App be installed? 必須設為 Any account**
       （使用者要把 App 裝到自己帳號上才能連結 repo）
     - Setup URL 填 `<host>/api/github/setup`
       （開發環境填 `http://localhost:3000/api/github/setup`）
     - Repository permissions 只需要 Contents: Read-only（Metadata 自動附帶）
   - Postgres（本地可用 `npx prisma dev`，或 Neon / Supabase 免費額度）

2. 建立資料庫 schema：

   ```bash
   npx prisma migrate dev
   ```

3. 啟動主站：

   ```bash
   npm run dev        # http://localhost:3000
   ```

4. 啟動 MCP server（另一個終端）：

   ```bash
   cd mcp-server && npm run dev   # http://localhost:3001
   ```

## 使用流程

1. GitHub 登入 → Dashboard 看得到：公開的 skill、分享給你（個人或群組）的 skill、你自己的。
2. 「我的 repo」→ 連結 repo（GitHub App installation）→ 預設全部未發布。
3. repo 設定頁：切換曝光模式、逐 skill 發布、公開開關（repo/skill 兩層級）、
   分享給群組或輸入 GitHub username 分享給個人。
4. 「我的群組」→ 建群組、輸入 username 加成員（對方不需同意）。

## 排程 sync

`/api/cron/sync` 會遍歷所有已連結的 repo 做 diff sync（webhook 的保底機制）。

- **部署在 Vercel**：`vercel.json` 已經設定每小時觸發一次；只要在 Vercel
  專案的環境變數加上 `CRON_SECRET`，Vercel 會自動帶對的 Authorization header。
- **其他環境**：任何排程器定期打

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/sync
  ```

## Rate limit

`/api/v1/skills/*` 都套了固定視窗的 rate limit，用 Bearer token（或沒帶 token
時退回 IP）當 key，超過限制回 429 + `Retry-After` header。MCP server 只是轉
呼叫這些 REST API，所以會一併受到保護。

**已知限制**：目前是純記憶體實作（`src/lib/rate-limit.ts`），多個獨立
serverless instance 下實際限制會比設定值寬鬆；要精準限流之後要換成
Upstash Redis（`@upstash/ratelimit`）之類的共享儲存。去 org 化後任何人
都能註冊，rate limit 比 v1 更重要。

## 測試

```bash
npm test
```

`src/lib/visibility.test.ts` 是整合測試，直接打 `.env` 裡設定的真實 Postgres
（沒有另外配測試庫）。所有 fixture 都用 `__vitest_visibility__` 開頭的
repoFullName / githubLogin 標記，跑完在 `afterAll` 全部清掉，不會污染真實資料。

## Claude 串接

在平台的 `/settings/tokens` 頁面產生 API token 後：

```bash
claude mcp add --transport http skillhub http://localhost:3001/mcp \
  --header "Authorization: Bearer <token>"
```

或安裝 `skills/skillsharing-find`、`skills/skillsharing-download` 兩個 skill
（設定 `SKILLHUB_URL` / `SKILLHUB_TOKEN` 環境變數），讓 Claude 直接用 curl 串接。
