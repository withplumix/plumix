---
"plumix": patch
---

Fixes the REST API preflight refusing a public write resource: an origin in `api.cors.origins` can now call a plugin's `auth: "public"` `POST`, `PUT`, `PATCH` or `DELETE` resource from the browser with a JSON body. Methods of token-authed resources are still never allowed cross-origin.
