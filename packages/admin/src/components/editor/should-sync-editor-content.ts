import type { JSONContent } from "@tiptap/react";

// RHF emits a fresh `value` reference on every keystroke; focus alone
// isn't a reliable guard because cmdk's slash-menu mount briefly steals
// activeElement. Structural compare keeps the suggestion's anchor range
// alive (#342).
export function shouldSyncEditorContent(
  current: JSONContent | null,
  incoming: JSONContent | null,
  isFocused: boolean,
): boolean {
  if (isFocused) return false;
  return JSON.stringify(current) !== JSON.stringify(incoming);
}
