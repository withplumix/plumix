---
"plumix": patch
---

Fixes the REST OpenAPI document (`/_plumix/api/v1/openapi.json`) describing timestamp fields as an empty schema. Every `v.date()` field in a REST response, including one in a plugin's REST resource, now documents as `{ "type": "string", "format": "date-time" }`, matching the ISO-8601 string it serializes to.
