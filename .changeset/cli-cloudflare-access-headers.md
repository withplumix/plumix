---
"plumix": patch
---

Sends Cloudflare Access service-token headers on every CLI request to a deployed site when `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` are set, and fails with `remote_behind_access` instead of an unrelated error when Access turns the request away.
