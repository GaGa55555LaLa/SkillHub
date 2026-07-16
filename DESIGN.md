# 學生叢集競賽團隊 Skills 共享平台 — 設計文件

## 1. 專案目標

供同屬一個 GitHub Organization 的競賽團隊成員上傳、瀏覽、分享 skills（不限比賽用途）。
Skill 格式比照 Claude Skills：repo 內一個含 `SKILL.md`（frontmatter: name、description、觸發時機）
的資料夾，加上相關腳本/範本/資源檔案。一個 repo 可以包含多個 skill。

Skill 來源分兩種：

| 來源 | 位置 | 預設可見度 |
|---|---|---|
| Org repo | `github.com/<org>/<repo>` | Org 全體成員可見 |
| 個人 repo | `github.com/<user>/<repo>` | 僅擁有者本人，由擁有者手動指定分享對象 |

兩種來源最終都正規化成同一種「skill 條目」，前端與 API 不區分來源，只區分「誰能看到」。

除了網站介面外，另外提供 **remote MCP server**，讓團隊成員可以直接透過 Claude（Claude Code /
Claude.ai custom connector）搜尋並下載 skill。

---

## 2. 授權與資料串接

### 2.1 兩種身份機制分工

- **GitHub OAuth（Auth.js / NextAuth）**：純粹用來「認人」——使用者登入平台的身份驗證，
  同時用來檢查是否為指定 org 的 member（`GET /orgs/{org}/members/{username}`），非成員一律拒絕進站。
- **GitHub App**：用來「取資料」——讀取 repo 內容，與使用者的登入身份無關。平台後端一律用
  App 的 installation token 去讀取內容，再由平台自己的權限表把關誰能看到什麼。這樣即使
  skill 被分享給某人，對方也完全不需要自己安裝 App 或被加為 GitHub collaborator。

### 2.2 GitHub App 權限範圍

- Organization members（read）— 登入時驗證 org 成員身份
- Organization teams（read）— 讓分享對象選單支援「team」
- Repository contents（read）— 讀取 org repo 與個人授權 repo 的內容
- Metadata（read）— 基本必要權限

不需要 collaborator write / administration 權限（見 §5 私有內容存取方案）。

### 2.3 安裝範圍

- App 裝在 Organization 上（installation 選「All repositories」），自動涵蓋所有 org repo。
- 個人 repo 不會自動被涵蓋，需要成員主動走「連結我的 repo」流程：
  導去 GitHub App installation 設定頁 → 選擇要授權的個人 repo → callback 回平台 → 平台記錄
  該 repo 屬於該使用者，並開放後續掃描與分享設定。

---

## 3. Skill 掃描機制

### 3.1 Org 端（來源一）

- **觸發方式**：排程（每天一次）+ Admin 手動「立即刷新」按鈕（加防抖，5 分鐘內限觸發一次）。
- **流程**：
  1. 用 installation token 呼叫 `GET /installation/repositories`，取得 App 可見的所有 org repo 清單。
  2. 用各 repo 的 `pushed_at` / default branch 最新 commit sha 與上次掃描記錄比對，只有變動過的
     repo 才重新掃描。
  3. 對有變動的 repo 呼叫 `GET /repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1`，
     篩出路徑符合 `**/SKILL.md` 的項目，其上一層資料夾視為一個 skill root。
  4. 寫入/更新 `skills` 表；沒有 SKILL.md 的 repo 直接跳過，不會出現在平台上。

### 3.2 個人 repo 端（來源二）

連結 repo 時選擇 `share_mode`：

- **`whole_repo`**：掃描出的所有 skill 全部沿用該 repo 目前的分享設定；未來新增的 skill
  資料夾會自動繼承同樣的分享對象，不需要每次手動 re-share。
- **`selected_only`**：連結後看到掃描出的 skill 清單，使用者自行勾選要曝光哪幾個
  （`skills.is_published`）。未勾選的 skill 完全不會出現在平台上，其他人也無從得知其存在。
  未來新增的 skill 預設 `is_published = false`，需要使用者手動勾選才會發布。

同步機制與 §3.1 相同（webhook push event 觸發 + 排程 diff sync 作為保底）。

---

## 4. 分享對象

`skill_shares` 支援 `grantee_type = 'user' | 'team'`，分享對象選單合併顯示 org members 與
org teams 兩個群組。

**已知限制**：GitHub 原生的 Team repo 權限只作用在 org 擁有的 repo，無法套用在個人帳號 repo 上。
因此「分享給某個 team」這件事完全是**平台層**的邏輯（平台自己的資料庫記錄誰在哪個 team、
誰能看到什麼），不會、也不需要反映到 GitHub 原生的 repo collaborator 設定上——這正是
§5 選擇「平台代理內容」而非「邀請為 collaborator」的原因之一。

---

## 5. 私有個人 repo 的內容存取（方案 A：平台代理）

**結論：內容一律由平台代理顯示/下載，不依賴 GitHub 原生連結或 collaborator 機制。**

- 平台用 App installation token 抓取 SKILL.md 與相關檔案內容，快取進 `skill_content_cache`。
- 被分享者在平台頁面直接看到完整內容（名稱、描述、渲染後的 SKILL.md、檔案列表），
  **不會**也**不需要**被加為該私有 repo 的 GitHub collaborator。
- 「查看原始 repo」連結：
  - 來源 repo 為 **public** → 直接連 `github.com/...`。
  - 來源 repo 為 **private** → 不提供會 404 的 GitHub 連結，改為顯示「原始 repo 為私有，
    此內容由擁有者透過本平台分享」，並提供平台自己的「下載」按鈕（列出檔案內容 / 打包 zip）。

**設計意涵**：平台本身即為實際的存取控制邊界；GitHub 的 private 設定只擋住「未被分享」的人，
一旦擁有者透過平台分享，內容存取即由平台的 `skill_shares` 判斷邏輯把關，不再是 GitHub 原生 ACL。
這個判斷邏輯必須嚴格測試，且所有存取需要留稽核 log（見 §8）。

---

## 6. 資料模型（Postgres）

```
users
  id, github_id, github_login, github_avatar_url

skill_sources                          -- 一個 repo = 一個來源
  id
  repo_full_name
  owner_type            'org' | 'user'
  owner_user_id          nullable，個人 repo 才有
  installation_id
  share_mode             'whole_repo' | 'selected_only'   -- 僅個人 repo 有意義
  visibility              'public' | 'private'              -- 對應 GitHub repo 可見度
  last_synced_at
  last_commit_sha

skills                                  -- repo 內偵測到的每個 skill 資料夾
  id
  source_id          -> skill_sources
  path                （repo 內資料夾路徑）
  name
  description
  content_sha         （判斷是否需要重新 sync 快取）
  is_published         boolean，預設 true；share_mode='selected_only' 時預設 false

skill_content_cache                     -- 私有內容快取（方案 A 用）
  id
  skill_id           -> skills
  file_path
  file_content
  cached_at

skill_shares
  id
  skill_id            -> skills，nullable（若為 null 代表整個 source 的分享設定）
  source_id           -> skill_sources
  grantee_type         'user' | 'team'
  grantee_id           （github user id 或 team id）
  granted_by
  granted_at

api_tokens                              -- 供 MCP / API 使用
  id
  user_id             -> users
  token_hash
  created_at
  last_used_at
  revoked_at

access_audit_log
  id
  actor_user_id
  skill_id
  action                'view' | 'download'
  accessed_at
```

### 6.1 可見性判斷邏輯（讀取 skill 列表時，後端強制執行，前端不可信任過濾）

```
可見 skill 清單 =
  ( source.owner_type = 'org' 的所有已發布 skill )
  UNION
  ( skill_shares 命中「目前使用者」或「目前使用者所屬的 org team」，
    比對 skill_id 或其所屬 source_id 的分享設定 )
  UNION
  ( 目前使用者自己是該 skill 的 owner，無論是否已發布 )
```

---

## 7. 使用者操作流程

1. **登入**：GitHub OAuth → 檢查 org member 身份 → 通過才能進站。
2. **瀏覽/搜尋**：Dashboard 列出可見 skill，可依來源（org / 分享給我）、擁有者、關鍵字搜尋。
3. **Org skill**：自動出現，不需手動上傳；成員可選擇「認領」自己寫的 skill 以顯示歸屬。
4. **個人 repo skill**：
   - 「連結我的 repo」→ 走 GitHub App installation 授權 → 選擇 `share_mode`
     （整包 or 選擇性發布）→ 選分享對象（個人帳號或 team）。
   - 「我的分享」頁面可隨時增減分享對象、切換 `is_published`、收回分享。
5. **檢視 skill**：點進去看名稱、描述、渲染後的 SKILL.md 內容；public repo 提供「在 GitHub 上
   查看」連結，private repo 提供平台內建下載。
6. **用 Claude 取用**：見 §9。

---

## 8. 稽核與安全

- 所有對 `skill_content_cache` 的讀取（網站與 API/MCP 皆同）都寫入 `access_audit_log`，
  記錄誰在什麼時候看了/下載了哪個 skill，供事後排查外洩。
- `api_tokens` 可隨時撤銷（`revoked_at`），token 只雜湊儲存、產生時一次性顯示明碼。
- MCP / REST API 加合理 rate limit，避免 token 外洩後被大量爬取。
- 權限判斷邏輯（§6.1）需要有對應的自動化測試（org 成員 / 非成員、被分享 / 未被分享、
  team 成員 / 非 team 成員等情境）。

---

## 9. Claude 串接（Remote MCP Server）

獨立輕量服務（可與主站共用 DB，獨立部署），用 `@modelcontextprotocol/sdk` 實作
HTTP + SSE transport 的 remote MCP server，暴露三個工具：

```
search_skills(query: string)
  -> [{ id, name, description, owner, source_type }]

get_skill_details(id: string)
  -> { name, description, skill_md_content, file_list }

download_skill(id: string)
  -> { files: [{ path, content }] }
     // 直接回傳檔案內容陣列而非 zip，方便 agent 直接寫入本地 .claude/skills/<name>/
```

**認證**：使用者在平台「設定」頁生成個人 API Token（對應 `api_tokens` 表），設定到 Claude Code：

```bash
claude mcp add --transport http skillhub https://your-domain/mcp \
  --header "Authorization: Bearer <token>"
```

- 每個 token 綁定 GitHub 使用者身份，`search_skills` / `download_skill` 內部一律套用 §6.1
  的可見性判斷邏輯，跟網站行為完全一致，不會多看到東西。
- 同一套邏輯也可包成一般 REST API（`GET /api/v1/skills/search`、`GET /api/v1/skills/{id}`、
  `GET /api/v1/skills/{id}/download`），MCP server 內部直接呼叫這些 API，避免邏輯重複維護。

---

## 10. 技術棧

- **前端/全端框架**：Next.js（App Router）+ TypeScript
- **資料庫**：Postgres（Neon / Supabase 免費額度起步）
- **Auth**：Auth.js（NextAuth）處理 GitHub OAuth 登入
- **GitHub 整合**：Octokit（`@octokit/app` + `@octokit/webhooks`）
- **MCP server**：`@modelcontextprotocol/sdk`，獨立部署，共用主站 DB 與權限邏輯（或直接呼叫主站 REST API）
- **排程 job**：Vercel Cron 或 GitHub Actions schedule 呼叫 sync API（初期不需要 queue system）
- **部署**：Vercel（前端 + API routes）+ Neon/Supabase（DB）

---

## 11. MVP 範圍

1. GitHub OAuth 登入 + org member 檢查
2. GitHub App 安裝於 org，自動掃描 org repo 內的 SKILL.md（來源一）
3. Dashboard 列出 org 內所有已發布 skill
4. 個人 repo 連結 + `share_mode` 設定 + 分享對象（個人/team）設定（來源二）
5. Skill 詳細頁：渲染 SKILL.md、public repo 給 GitHub 連結、private repo 走平台代理下載
6. 稽核 log 基本版
7. Remote MCP server + REST API（`search_skills` / `get_skill_details` / `download_skill`）
