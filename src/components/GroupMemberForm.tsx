"use client";

import { useActionState } from "react";
import { addGroupMember } from "@/lib/actions/groups";
import { UsernameField, type UserOption } from "@/components/UsernameField";

/** 群組加成員表單：帶頭貼建議下拉 + 失敗時顯示錯誤（不再靜默失敗）。 */
export function GroupMemberForm({
  groupId,
  users,
}: {
  groupId: string;
  users: UserOption[];
}) {
  const [state, formAction, pending] = useActionState(
    addGroupMember.bind(null, groupId),
    null
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 text-sm">
      <UsernameField users={users} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-gray-300 px-2 py-1 hover:border-gray-500 disabled:opacity-50 dark:border-gray-700"
      >
        {pending ? "加入中…" : "加入成員"}
      </button>
      {state?.error && (
        <span className="text-xs text-red-500">{state.error}</span>
      )}
    </form>
  );
}
