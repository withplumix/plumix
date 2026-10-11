---
"@plumix/runtime-bun": minor
---

Writes each line Plumix logs to stdout as one JSON object (`level`, `message`, `time`, the call's fields, and errors with their stack) from a built server, so a log drain or journald can parse it. `plumix dev` keeps its readable output, and `plumix doctor` reports where the logs go.
