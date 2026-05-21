import type { Mark as TiptapMarkExtension } from "@tiptap/core";

/**
 * Minimal metadata for a registered inline mark. Admin consumers (bubble
 * menu, manifest) read this; rendering goes through the hardcoded
 * `renderInline` walker which already knows every core mark by name.
 *
 * Plugin authors register marks through the manifest; the Tiptap extension
 * itself comes through `coreMarkExtensions` (core) or
 * `plugin.adminEntry.<adminSchema>` (plugin).
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
   * The synchronous Tiptap Mark instance for this mark. Stored here so
   * the admin editor can build its extension list without any awaits.
   * Core marks set this directly; plugin marks omit it and provide
   * `adminSchema` instead.
   */
  readonly schema?: ReturnType<typeof TiptapMarkExtension.create>;
  /**
   * Export name on the plugin's `adminEntry` module that resolves to the
   * Tiptap `Mark.create(...)` instance. Lets the admin chunk synthesizer
   * wire the mark into the editor's extension list. Core marks leave
   * this unset — the admin imports `@plumix/blocks` directly.
   */
  readonly adminSchema?: string;
}
