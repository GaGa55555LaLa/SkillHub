import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/**
 * DESIGN.md §9：Remote MCP server（Streamable HTTP、stateless）。
 * 三個工具內部直接呼叫主站 REST API（帶轉發使用者的 Bearer token），
 * 可見性判斷完全交給主站，避免邏輯重複維護。
 *
 * Claude Code 設定方式：
 *   claude mcp add --transport http skillhub https://<host>/mcp \
 *     --header "Authorization: Bearer <token>"
 */

const PLATFORM_API_URL =
  process.env.PLATFORM_API_URL ?? "http://localhost:3000";
const PORT = Number(process.env.PORT ?? 3001);

async function callPlatformApi(path: string, bearerToken: string) {
  const res = await fetch(`${PLATFORM_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!res.ok) {
    throw new Error(`Platform API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function buildServer(bearerToken: string): McpServer {
  const server = new McpServer({ name: "skillhub", version: "0.1.0" });

  server.registerTool(
    "search_skills",
    {
      description:
        "搜尋你可見的 skills（平台公開 + 分享給你或你所屬群組的 + 你自己的）。回傳 id、名稱、描述、擁有者。",
      inputSchema: { query: z.string().describe("關鍵字，比對名稱與描述") },
    },
    async ({ query }) => {
      const data = await callPlatformApi(
        `/api/v1/skills/search?q=${encodeURIComponent(query)}`,
        bearerToken
      );
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  server.registerTool(
    "get_skill_details",
    {
      description: "取得單一 skill 的完整 SKILL.md 內容與檔案清單。",
      inputSchema: { id: z.string().describe("skill id") },
    },
    async ({ id }) => {
      const data = await callPlatformApi(
        `/api/v1/skills/${encodeURIComponent(id)}`,
        bearerToken
      );
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  server.registerTool(
    "download_skill",
    {
      description:
        "下載 skill 的所有檔案內容（path 為相對路徑）。寫入本地時請用回傳的 " +
        "suggested_dir_name 當資料夾名稱（.claude/skills/<suggested_dir_name>/），" +
        "不要用 name —— name 只是顯示用字串，不同來源的 skill 可能同名，" +
        "直接拿來當資料夾會互相覆蓋。",
      inputSchema: { id: z.string().describe("skill id") },
    },
    async ({ id }) => {
      const data = await callPlatformApi(
        `/api/v1/skills/${encodeURIComponent(id)}/download`,
        bearerToken
      );
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  const bearerToken = authHeader.slice("Bearer ".length).trim();

  // stateless：每個請求建新 server + transport，token 綁在該請求上
  const server = buildServer(bearerToken);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`SkillHub MCP server listening on :${PORT}`);
});
