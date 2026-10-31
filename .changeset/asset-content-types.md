---
"plumix": patch
---

Fixes the Node and Bun runtimes serving `.mjs` files as `application/octet-stream`, which kept a built site's admin from loading its plugins' translation catalogs. Static files now get their content type from the same table Vite's dev server uses, so `.pdf`, `.mp4`, `.otf` and other files in `public/` are served with their real types too.
