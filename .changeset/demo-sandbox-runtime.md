---
"@plumix/runtime-cloudflare": minor
---

Add an anonymous demo sandbox through the new `@plumix/runtime-cloudflare/demo` subpath. `demoPreset({ binding, loadSql, turnstile? })` returns a `runtime`/`database`/`auth` trio that hands every anonymous visitor an isolated, self-expiring Cloudflare Durable Object database — no sign-up — so a site can showcase its admin and editor.

Cookieless visitors render a shared, read-only "showcase" database; clicking through provisions a per-session sandbox on demand, which self-cleans on a TTL alarm. Media writes are blocked (the storage bucket is shared) and security-sensitive routes are refused. Optional Turnstile gates provisioning against bots. The whole module is code-isolated on the subpath, so sites that don't opt in never bundle it.
