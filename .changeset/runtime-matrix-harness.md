---
"plumix": minor
"@plumix/runtime-cloudflare": patch
"create-plumix-app": patch
---

Adds `buildAppClientFirst` to `plumix/vite`, the client-before-server build
ordering a runtime's build command installs as Vite's `builder.buildApp`; the
Cloudflare build command now imports it from there. Lets a runtime's
`plumix.scaffold` block name its local secrets file (`secretsFile`, default
`.dev.vars`) and the paths its tooling writes into `.gitignore` (`gitignore`),
so the scaffolder's base `.gitignore` and generated config comment stop naming
wrangler. A scaffolded Cloudflare project is unchanged apart from the order of
two `.gitignore` lines and the wording of the secrets comment. The scaffold
smoke job runs every registered runtime against the `blank` and `all-plugins`
shapes.
