---
"@plumix/admin": patch
"@plumix/admin-ui": patch
---

Ships third-party license notices with the prebuilt admin. `dist` now carries `THIRD-PARTY-NOTICES.txt` for every bundled library plus the SIL OFL text for the Geist fonts, and the build fails if a dependency is not permissively licensed. Replaces `ua-parser-js` 2.x, which relicensed to AGPL-3.0, with the MIT-licensed 1.x line — session rows now read "Mac OS" where they read "macOS".
