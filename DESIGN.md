# SkillHub — Skills 共享平台 設計文件（v2：去 Organization 化）

> v1 以 GitHub Organization 為邊界（org 成員才能登入、org repo 全員可見、
> 分享對象含 org team）。v2 拿掉 org 綁定：**任何 GitHub 帳號都能登入**，
> 每個人以自己的身份連結 repo、瀏覽與分享；分享對象改為**平台自建群組**
> 與個人。本文件為 v2 的完整規格，v1 的差異只在此註明，不另留舊文。

## 1. 專案目標

供任何 GitHub 使用者上傳、瀏覽、分享 skills。
Skill 格式比照 Claude Skills：repo 內一個含 `SKILL.md`（frontmatter: name、description、觸發時機）
的資料夾，加上相關腳本/範本/資源檔案。一個 repo 可以包含多個 skill。

**來源只有一種**：使用者自己連結的 GitHub repo（個人帳號或其管理的 org 帳號皆可，
平台一視同仁——誰連結的，誰就是這個來源的擁有者）。

可見度模型（詳見 §6.1）：

| 層級 | 誰看得到 |
|---|---|
| 私有（預設） | 只有擁有者 |
| 分享給個人 | 被指定的使用者 |
| 分享給群組 | 群組內所有成員（群組是平台自建的，見 §4） |
| 公開 | 平台上所有登入使用者（**注意：任何人都能註冊，公開實質等於全世界可見**） |

除了網站介面外，另外提供 **remote MCP server**，讓使用者直接透過 Claude（Claude Code /
Claude.ai custom connector）搜尋並下載 skill。

---

## 2. 授權與資料串接

### 2.1 兩種身份機制分工

- **GitHub OAuth（Auth.js / NextAuth）**：純粹用來「認人」——任何 GitHub 帳號都可登入，
  登入即在平台建立/更新 `users` 記錄。（v1 的 org member 檢查已移除，scope 只需 `read:user`。）
- **GitHub App**：用來「取資料」——讀取 repo 內容，與登入身份無關。平台後端一律用
  App 的 installation token 讀取內容，再由平台自己的權限表把關誰能看到什麼。被分享者
  完全不需要安裝 App 或被加為 GitHub collaborator。

### 2.2 GitHub App 權限範圍

- Repository contents（read）— 讀取使用者授權 repo 的內容
- Metadata（read）— 基本必要權限

（v1 需要的 Organization members / teams read 權限已不再需要。）

App 的「Where can this GitHub App be installed?」必須設為 **Any account**，
任何使用者才能把 App 裝到自己的帳號上。

### 2.3 連結 repo 流程

使用者主動走「連結我的 repo」：導去 GitHub App installation 頁 → 把 App 裝到
自己的帳號（或自己管理的 org）並選擇授權哪些 repo → GitHub 導回平台的 Setup URL
（`/api/github/setup?installation_id=...`）→ 平台以當下登入 session 記錄
「這些 repo 屬於這位使用者」，並觸發首次掃描。

---

## 3. Skill 掃描機制

連結 repo 時選擇 `share_mode`，決定看 repo 層級還是 skill 層級的
公開/分享設定，兩者互斥（不疊加）：

- **`whole_repo`**：只看 repo 層級的公開/分享設定，cascade 到底下所有
  skill；未來新增的 skill 資料夾自動繼承，不需要每次手動 re-share。
- **`selected_only`**（連結時的預設）：只看每個 skill 自己的公開/分享
  設定。新掃到的 skill 預設 `is_public = false`、無分享——本來就不會
  曝光給任何人，不需要額外的「發布」開關再保護一次。

掃描流程：
1. 用該來源的 installation token 取 default branch 最新 commit sha，與上次記錄比對，
   沒變動就跳過。
2. `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` 篩出 `**/SKILL.md`，
   其上層資料夾視為 skill root。
3. 解析 SKILL.md frontmatter 寫入 `skills` 表，並把 skill 資料夾底下**所有檔案**
   內容快取進 `skill_content_cache`（見 §5）。

觸發方式：webhook push event（若啟用）＋排程 sync 保底（`/api/cron/sync`，
遍歷所有來源）＋擁有者在 repo 設定頁手動「重新掃描」。

---

## 4. 群組（Groups）

- 任何使用者都可以建立群組（`groups`），群組屬於建立者。
- **加人機制**：擁有者輸入對方的 GitHub username 直接加入，對方不需同意
  （被加入只是獲得觀看權，無風險）。平台用 GitHub API `GET /users/{username}`
  解析出穩定的 `github_id`，若對方還沒登入過平台，先建立 placeholder `users`
  記錄——之後對方首次登入時以 `github_id` 對上同一筆。
- 分享對象選單只列出**自己建立的**群組（分享到別人的群組沒有意義：你不知道
  裡面有誰）。
- 群組成員身份只影響可見性判斷（§6.1），查詢一律走平台 DB，不打 GitHub API。

---

## 5. 私有 repo 的內容存取（平台代理）

**內容一律由平台代理顯示/下載，不依賴 GitHub 原生連結或 collaborator 機制。**

- 平台用 App installation token 抓取 skill 資料夾全部檔案內容，快取進
  `skill_content_cache`。
- 被分享者在平台頁面直接看到完整內容，不需要成為該 repo 的 collaborator。
- 「查看原始 repo」連結：來源 repo 為 GitHub public → 直接連 `github.com/...`；
  private → 顯示「原始 repo 為私有，此內容由擁有者透過本平台分享」，
  改用平台內建下載。

**設計意涵**：平台本身即為實際的存取控制邊界。可見性判斷邏輯必須嚴格測試，
所有內容存取寫入稽核 log（§8）。

---

## 6. 資料模型（Postgres）

```
users
  id, github_id (unique), github_login (unique), github_avatar_url
  -- 可能是 placeholder（被加進群組/被分享但還沒登入過的人）

skill_sources                          -- 一個 repo = 一個來源
  id
  repo_full_name (unique)
  owner_user_id        -> users（必填；v1 的 owner_type 'org'|'user' 已移除）
  installation_id
  share_mode            'whole_repo' | 'selected_only'
  visibility            'public' | 'private'    -- 對應 GitHub repo 本身的可見度
  is_public             boolean, default false  -- 平台層公開：全平台使用者可見
  last_synced_at, last_commit_sha

skills
  id
  source_id          -> skill_sources
  path, name, description, content_sha
  is_public           boolean, default false  -- 單一 skill 層級的平台公開
                       （只在 share_mode = selected_only 時生效，見 §6.1）

skill_content_cache
  id, skill_id -> skills, file_path, file_content, cached_at

groups
  id, name, owner_user_id -> users, created_at
  unique(owner_user_id, name)

group_members
  id, group_id -> groups, user_id -> users, added_at
  unique(group_id, user_id)

skill_shares
  id
  skill_id            -> skills，nullable（null = 整個 source 層級的分享）
  source_id           -> skill_sources
  grantee_user_id     -> users，nullable   ┐ 兩者恰好填一個
  grantee_group_id    -> groups，nullable  ┘（v1 的 grantee_type+grantee_id 已改為 FK）
  granted_by, granted_at

api_tokens
  id, user_id -> users, token_hash (unique), created_at, last_used_at, revoked_at

access_audit_log
  id, actor_user_id, skill_id, action 'view'|'download', accessed_at
```

### 6.1 可見性判斷邏輯（後端強制執行，前端不可信任過濾）

```
可見 skill 清單 =
  ( share_mode = whole_repo 且 (source.is_public
      或 source 層級 skill_shares 命中「目前使用者」或其所屬群組) )
  UNION
  ( share_mode = selected_only 且 (skill.is_public
      或 skill 層級 skill_shares 命中「目前使用者」或其所屬群組) )
  UNION
  ( 目前使用者是該 source 的擁有者，無論公開/分享設定為何 )      -- 自己的
```

沒有「發布」這個中間狀態：連結 repo 後新掃到的 skill 預設不公開、
不分享，本來就不會曝光給任何人。`share_mode` 決定看 repo 層級還是
skill 層級的設定，兩者互斥——切換模式不會清掉另一邊的設定，只是
暫時不生效，切回去會立即恢復。

---

## 7. 使用者操作流程

1. **登入**：GitHub OAuth，任何帳號皆可。
2. **瀏覽/搜尋**：Dashboard 列出可見 skill（公開 / 分享給我 / 我的），關鍵字搜尋。
3. **連結 repo**：「我的 repo」→ GitHub App installation → 回平台 → 預設
   `selected_only`、全部未公開/未分享，需自行設定。
4. **設定分享**（repo 設定頁）：
   - 切換 `share_mode`：`whole_repo` 只設定一次套用全部；`selected_only`
     逐 skill 各自設定。
   - 公開開關：`whole_repo` 設整個 repo；`selected_only` 設單一 skill。
   - 分享對象：選自己的群組，或輸入 GitHub username 分享給個人；隨時可收回。
5. **群組管理**（`/settings/groups`）：建立/刪除群組、加/移除成員。
6. **檢視 skill**：渲染 SKILL.md；GitHub public repo 給原始連結，private 走平台下載。
7. **用 Claude 取用**：見 §9。

---

## 8. 稽核與安全

- 所有內容讀取（網站與 API/MCP）寫入 `access_audit_log`。
- `api_tokens` 可撤銷，只存雜湊，明碼一次性顯示。
- REST API 全面 rate limit——**去 org 化後任何人都能註冊，rate limit 與
  可見性判斷的正確性比 v1 更關鍵**。
- 可見性邏輯（§6.1）必須有自動化測試：公開/私有、個人分享/群組分享、
  群組成員/非成員、whole_repo 與 selected_only 互斥不疊加、擁有者永遠可見。

---

## 9. Claude 串接（Remote MCP Server）

獨立輕量服務，用 `@modelcontextprotocol/sdk` 實作 Streamable HTTP 的
remote MCP server，暴露三個工具（內部轉呼叫主站 REST API，可見性判斷
完全交給主站）：

```
search_skills(query: string)
  -> [{ id, name, description, owner }]

get_skill_details(id: string)
  -> { name, description, skill_md_content, file_list }

download_skill(id: string)
  -> { name, owner, suggested_dir_name, files: [{ path, content }] }
     // 直接回傳檔案內容陣列而非 zip，方便 agent 直接寫入本地
     // .claude/skills/<suggested_dir_name>/。name 只是 SKILL.md
     // frontmatter 解析出來的顯示字串，不保證唯一（不同人 fork 同一個
     // 公開範本很容易撞名），寫入本地資料夾要用 suggested_dir_name
     // （owner-name slug）而非 name，避免互相覆蓋。
```

**認證**：使用者在 `/settings/tokens` 生成個人 API Token，設定到 Claude Code：

```bash
claude mcp add --transport http skillhub https://your-domain/mcp \
  --header "Authorization: Bearer <token>"
```

- 每個 token 綁定使用者身份，API 一律套用 §6.1 的可見性判斷，跟網站行為一致。
- REST API：`GET /api/v1/skills/search`、`GET /api/v1/skills/{id}`、
  `GET /api/v1/skills/{id}/download`。

另有兩個 bootstrap skill（`skills/skillsharing-find`、`skills/skillsharing-download`），
讓 Claude 不經 MCP、直接用 curl 串上述 REST API——與 MCP server 互補。

---

## 10. 技術棧

- **前端/全端框架**：Next.js（App Router）+ TypeScript
- **資料庫**：Postgres（Neon / Supabase 免費額度起步）
- **Auth**：Auth.js（NextAuth）處理 GitHub OAuth 登入
- **GitHub 整合**：Octokit（`@octokit/app` + `@octokit/webhooks`）
- **MCP server**：`@modelcontextprotocol/sdk`，獨立部署，轉呼叫主站 REST API
- **排程 job**：Vercel Cron 或任意排程器呼叫 `/api/cron/sync`
- **部署**：Vercel 或自架 server（Next.js + MCP server 同機、反向代理分流）

---

## 11. 範圍（v2）

1. GitHub OAuth 登入（任何帳號）
2. repo 連結 + `share_mode`（whole_repo 整包 / selected_only 逐 skill）
3. 群組管理（建立/刪除/加人/移除）
4. 分享設定：群組分享、個人分享（username）、平台公開開關（repo 與 skill 兩層級）
5. Dashboard + Skill 詳細頁（markdown 渲染、平台代理下載）
6. 稽核 log、API token、rate limit
7. Remote MCP server + REST API + bootstrap skills
