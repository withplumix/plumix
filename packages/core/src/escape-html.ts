/**
 * Leaves quotes alone, so it is safe for element content and `<title>`, not
 * attribute values.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
