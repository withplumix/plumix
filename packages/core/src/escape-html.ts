// Escapes the three characters unsafe in HTML *element content* — `&`, `<`,
// `>`. It deliberately leaves quotes alone, so it is only safe for text /
// RCDATA contexts (element children, `<title>`), NOT attribute values. For an
// attribute, escape quotes on top of this (see the local `escapeAttr` helpers).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
