---
"@plumix/admin-editor": minor
---

Removes the unused canvas, store and config exports from `@plumix/admin-editor`'s root entry (`connectCanvas`, `connectRuntime`, `EditorCanvas`, `CanvasFrame`, `EditorConfigProvider`, `useEditorConfig`, `EditorProvider`, `useEditorStore`, `createEditorStore`, `MIN_ZOOM`, `MAX_ZOOM` and their types). The entry now exports `PlumixEditor`, `bootEditor` and `EDITOR_COMMAND_DESCRIPTORS`, plus the `PlumixEditorProps`, `PublishActions`, `DraftMode` and `InserterPattern` types needed to type what you pass to `PlumixEditor`.
