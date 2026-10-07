---
"@plumix/core": patch
---

Fixes a signed-in visit to a page whose type has an access policy granting `anonymous` being cached for anonymous visitors. Such a visit now renders privately, as it does on a page with no policy, and a public route with such a policy answers it with `cache-control: private, no-store`.
