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
- [ ] SKILL.md 的 markdown 渲染（目前為原文顯示）
- [ ] 排程 sync（Vercel Cron / GitHub Actions schedule 呼叫 `/api/admin/sync`）
- [ ] 可見性邏輯的自動化測試（DESIGN.md §8）
- [ ] Rate limit
