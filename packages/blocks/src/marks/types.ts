/**
 * Metadata for a registered inline mark — Tiptap-free so the server graph can
 * read the catalogue (bubble menu, manifest, validation allowlist) without the
 * editor's ProseMirror graph. Rendering goes through the hardcoded
 * `renderInline` walker which already knows every core mark by name.
 *
 * The Tiptap extension itself comes through `coreMarkExtensions` (core) or
 * `plugin.adminEntry.<adminSchema>` (plugin), both imported only by the editor.
 */
export interface MarkSpec {
  readonly name: string;
  readonly title: string;
  readonly description?: string;
  readonly keyboardShortcut?: string;
  /** Label shown in the bubble menu button (defaults to `title`). */
  readonly bubbleMenuLabel?: string;
  /** Optional Lucide icon name for the bubble menu button. */
  readonly bubbleMenuIcon?: string;
  /**
   * Export name on the plugin's `adminEntry` module that resolves to the
   * Tiptap `Mark.create(...)` instance. Lets the admin chunk synthesizer
   * wire the mark into the editor's extension list. Core marks leave
   * this unset — the admin imports `coreMarkExtensions` directly.
   */
  readonly adminSchema?: string;
}
