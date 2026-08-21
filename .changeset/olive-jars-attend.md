---
"@plumix/core": minor
---

Adds `JsonObject` and gives `JsonValue` a home of its own, both exported from `plumix`. Use them to describe data that crosses a serialization boundary — stored metadata, span attributes, message payloads — instead of a dictionary of `unknown`. `JsonValue` was previously reachable only as a wildcard re-export of an internal telemetry module; it is now a deliberate part of the public API.
