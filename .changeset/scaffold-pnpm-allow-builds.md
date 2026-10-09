---
"create-plumix-app": patch
---

Fixes `pnpm install` in a new Cloudflare or Node.js project. The project now ships a `pnpm-workspace.yaml` that declines the esbuild and workerd build scripts, so pnpm 10 no longer warns about ignored build scripts and pnpm 11 no longer refuses to install.
