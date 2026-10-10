/**
 * Tiptap-free so the server can read the catalogue without the editor's
 * ProseMirror graph.
 */
export interface MarkSpec {
  readonly name: string;
  readonly title: string;
  readonly description?: string;
  readonly keyboardShortcut?: string;
  /** Label shown in the bubble menu button (defaults to `title`). */
  readonly bubbleMenuLabel?: string;
  /** Lucide icon name for the bubble menu button. */
  readonly bubbleMenuIcon?: string;
  /**
   * Export name on the plugin's `adminEntry` module that resolves to the
   * Tiptap `Mark.create(...)` instance. Core marks leave it unset.
   */
  readonly adminSchema?: string;
}
