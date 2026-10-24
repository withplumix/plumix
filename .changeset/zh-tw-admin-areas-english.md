---
"@plumix/core": patch
---

Fixes the admin-area list for a browser asking for Traditional Chinese (`zh-TW`, `zh-HK`): it is now English instead of Simplified Chinese. Negotiation follows the CLDR parent locales, so `de-AT` still gets German and `zh-SG` gets Simplified Chinese.
