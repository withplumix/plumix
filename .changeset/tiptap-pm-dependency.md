---
"@plumix/core": patch
---

Fixes an `unmet peer @tiptap/pm` warning after upgrading Plumix: `@plumix/core` and `@plumix/admin-editor` now depend on `@tiptap/pm` themselves, so the editor always gets ProseMirror bindings from the same tiptap release and sites no longer need to add `@tiptap/pm` to their own dependencies.
