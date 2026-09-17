---
"plumix": patch
---

Fixes the dev MCP tools `telemetry_requests_list`, `telemetry_request_get` and the server half of `error_list` always answering empty when the debug bar is turned off. The dev request-history writer is now registered for every dev request independently of the bar, rather than only alongside it.
