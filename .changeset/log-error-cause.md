---
"plumix": patch
---

Fixes logged errors dropping their `cause`: both built-in loggers now write an error with its `name`, `message`, `stack` and `cause`, so a failed query shows the database error behind it, and a failed public render logs the error itself under `error` instead of only its message.
