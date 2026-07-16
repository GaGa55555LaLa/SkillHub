# SkillHub — 團隊 Skills 共享平台

供同屬一個 GitHub Organization 的競賽團隊成員上傳、瀏覽、分享 skills（Claude Skills 格式）。
完整設計見 [DESIGN.md](./DESIGN.md)。

## 架構

- **主站**（本目錄）：Next.js App Router + Prisma (Postgres) + Auth.js
  - GitHub OAuth 登入 + org member 檢查（`src/auth.ts`）
  - GitHub App 掃描 repo 內 `SKILL.md` 資料夾（`src/lib/github.ts`、`src/lib/sync.ts`）
  - 可見性判斷邏輯（`src/lib/visibility.ts`，DESIGN.md §6.1）
  - REST API：`/api/v1/skills/search`、`/api/v1/skills/:id`、`/api/v1/skills/:id/download`
  - 個人 repo 連結（`/settings/repos`、`/api/github/setup`）+ 分享對象設定
    （`/settings/repos/[id]`，`src/lib/actions/repos.ts`）
  - 排程 sync（`/api/cron/sync`，`vercel.json` 設定每小時觸發一次）
- **MCP server**（`mcp-server/`）：Streamable HTTP remote MCP，
  提供 `search_skills` / `get_skill_details` / `download_skill` 三個工具，
  內部轉呼叫主站 REST API。

## 開發環境設定

1. 複製環境變數範本並填入：

   ```bash
   cp .env.example .env
   ```

   需要事先建立：
   - **GitHub OAuth App**（登入用）→ `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`
   - **GitHub App**（讀 repo 用，安裝到 org）→ `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_ORG_INSTALLATION_ID`
     - 要在 GitHub App 設定頁的 **Setup URL** 填 `<host>/api/github/setup`
       （個人 repo 連結流程用，開發環境填 `http://localhost:3000/api/github/setup`）
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

## 排程 sync

`/api/cron/sync` 會依序同步 org 全部 repo + 所有已連結的個人 repo（webhook 的保底機制）。

- **部署在 Vercel**：`vercel.json` 已經設定每小時觸發一次；只要在 Vercel
  專案的環境變數加上 `CRON_SECRET`（跟本機 `.env` 用同一組，或重新產生
  一組都可以），Vercel 會自動帶對的 Authorization header，不用額外設定。
- **其他環境**：任何排程器（一般 cron、GitHub Actions schedule）定期打

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/sync
  ```

## Rate limit

`/api/v1/skills/*`（search、詳細頁、下載）都套了固定視窗的 rate limit，
用 Bearer token（或沒帶 token 時退回 IP）當 key，超過限制回 429 +
`Retry-After` header。MCP server 只是轉呼叫這些 REST API，所以會一併
受到保護，不需要在 MCP 那邊另外做一份。

**已知限制**：目前是純記憶體實作（`src/lib/rate-limit.ts`），對單一
長駐 process（`next start` 或保持溫機的單一 instance）沒問題，但如果
部署成多個各自獨立、頻繁冷啟動的 serverless instance，各自的計數不會
互相同步，實際限制會比設定值寬鬆。真的要在這種環境下精準限流，之後
要換成 Upstash Redis（`@upstash/ratelimit`）之類的共享儲存。

## 測試

```bash
npm test
```

`src/lib/visibility.test.ts` 是整合測試，直接打 `.env` 裡設定的真實 Postgres
（沒有另外配測試庫）。所有 fixture 都用 `__vitest_visibility__` 開頭的
repoFullName / githubLogin 標記，跑完在 `afterAll` 全部清掉，不會污染
真實資料。

## Claude Code 串接

在平台的 `/settings/tokens` 頁面產生 API token 後：

```bash
claude mcp add --transport http skillhub http://localhost:3001/mcp \
  --header "Authorization: Bearer <token>"
```

## 尚未實作（MVP 待辦）

- [x] 個人 repo 連結流程（GitHub App installation callback）
- [x] 分享對象設定 UI（個人 / team）
- [x] `selected_only` 模式的 skill 勾選 UI
- [x] API token 產生/撤銷 UI（`/settings/tokens`）
- [x] SKILL.md 的 markdown 渲染（`react-markdown` + `remark-gfm` + `@tailwindcss/typography`）
- [x] 排程 sync（`/api/cron/sync` + `vercel.json`）
- [x] 可見性邏輯的自動化測試（`src/lib/visibility.test.ts`，`npm test`）
- [x] Rate limit（`src/lib/rate-limit.ts`，純記憶體實作，見下方說明）
