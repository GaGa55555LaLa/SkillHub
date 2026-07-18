"use client";

import { useEffect, useState } from "react";

/**
 * MCP 串接說明。origin 取自瀏覽器網址(client component,SSR 階段先渲染
 * 佔位),不依賴 request URL——Next 16 在反向代理後面的 request.url 是
 * localhost,不能拿來組對外網址。
 */
export function McpGuide() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const command = `claude mcp add --transport http skillhub ${origin ?? "<本站網址>"}/mcp \\
  --header "Authorization: Bearer <你的token>"`;

  return (
    <section className="mt-10 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <h2 className="mb-2 text-lg font-semibold">串接 Claude Code(MCP)</h2>
      <p className="mb-3 text-sm text-gray-500">
        產生 token 後,在任何裝有 Claude Code 的機器上跑一次:
      </p>
      <pre className="overflow-x-auto rounded bg-gray-100 p-3 font-mono text-xs dark:bg-gray-900">
        {command}
      </pre>
      <p className="mt-3 text-sm text-gray-500">
        之後 Claude 就能直接搜尋(search_skills)、查看(get_skill_details)、
        下載安裝(download_skill)你可見的 skill。撤銷 token 即斷開串接。
      </p>
    </section>
  );
}
