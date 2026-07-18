"use client";

import { useActionState } from "react";
import { addUserShare } from "@/lib/actions/repos";
import { UsernameField, type UserOption } from "@/components/UsernameField";

/** 分享給個人的表單：帶頭貼建議下拉 + 失敗時顯示錯誤（不再靜默失敗）。 */
export function UserShareForm({
  sourceId,
  skillId,
  users,
}: {
  sourceId: string;
  skillId?: string;
  users: UserOption[];
}) {
  const [state, formAction, pending] = useActionState(
    addUserShare.bind(null, sourceId),
    null
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {skillId && <input type="hidden" name="skillId" value={skillId} />}
      <UsernameField users={users} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-gray-300 px-2 py-1 hover:border-gray-500 disabled:opacity-50 dark:border-gray-700"
      >
        {pending ? "分享中…" : "分享給個人"}
      </button>
      {state?.error && (
        <span className="text-xs text-red-500">{state.error}</span>
      )}
    </form>
  );
}
