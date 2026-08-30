---
"@plumix/blocks": patch
---

Fixes the inline formatting shortcuts never firing. Bold, italic, strikethrough, inline code and
underline each declared a chord in their mark metadata — and the editor's cheatsheet has been
listing all five since it shipped — but nothing bound them to the editor, so pressing Cmd/Ctrl+B
did nothing to the text. The chord a mark advertises is now what the editor binds.
