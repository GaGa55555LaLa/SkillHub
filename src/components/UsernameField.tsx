"use client";

import { useState } from "react";

export type UserOption = { login: string; avatarUrl: string | null };

/**
 * GitHub username 輸入框 + 平台使用者建議下拉（含頭貼）。
 * 原生 <datalist> 不能顯示圖片，所以自製；仍可自由輸入清單外的
 * username（要分享給還沒用過平台的人）。
 */
export function UsernameField({
  users,
  placeholder = "GitHub username（可挑選）…",
  className = "",
}: {
  users: UserOption[];
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  const matches = (
    value.trim()
      ? users.filter((u) =>
          u.login.toLowerCase().includes(value.trim().toLowerCase())
        )
      : users
  ).slice(0, 8);

  return (
    <div className="relative">
      <input
        type="text"
        name="username"
        required
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className={`w-48 rounded border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-700 ${className}`}
      />
      {open && matches.length > 0 && (
        <ul className="absolute left-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-950">
          {matches.map((u) => (
            <li key={u.login}>
              {/* onMouseDown 才能搶在 input 的 blur 之前執行 */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setValue(u.login);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.avatarUrl}
                    alt=""
                    className="h-5 w-5 rounded-full"
                  />
                ) : (
                  <span className="h-5 w-5 rounded-full bg-gray-300 dark:bg-gray-700" />
                )}
                <span>{u.login}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
