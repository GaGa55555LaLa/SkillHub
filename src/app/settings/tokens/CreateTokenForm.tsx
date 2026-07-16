"use client";

import { useActionState, useState } from "react";
import { createApiTokenAction } from "@/lib/actions/tokens";

type State = { token: string } | { error: string } | null;

async function action(_prev: State, _formData: FormData): Promise<State> {
  return createApiTokenAction();
}

export function CreateTokenForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    action,
    null
  );
  const [copied, setCopied] = useState(false);

  return (
    <div className="mb-8">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          {pending ? "產生中…" : "產生新 token"}
        </button>
      </form>

      {state && "token" in state && (
        <div className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
          <p className="mb-2 font-medium text-amber-800 dark:text-amber-200">
            這串 token 只會顯示這一次，請立刻複製保存：
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1 font-mono text-xs dark:bg-black">
              {state.token}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(state.token);
                setCopied(true);
              }}
              className="shrink-0 rounded border border-amber-400 px-2 py-1 text-xs hover:bg-amber-100 dark:hover:bg-amber-900"
            >
              {copied ? "已複製" : "複製"}
            </button>
          </div>
        </div>
      )}

      {state && "error" in state && (
        <p className="mt-2 text-sm text-red-500">建立失敗：{state.error}</p>
      )}
    </div>
  );
}
