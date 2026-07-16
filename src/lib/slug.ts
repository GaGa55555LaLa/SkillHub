/** 轉成適合當資料夾名稱的 slug：小寫、非英數字元換成 -，收斂重複 -。 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
