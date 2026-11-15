---
"plumix": minor
---

Adds the `user:create_tokens` capability, which `author` and `editor` hold by default. Minting an API token needs it, whether from the profile's API tokens card, by approving a CLI's device code, or by connecting an app over OAuth, and the admin hides the create form from anyone without it. A token works only while its owner's role holds it, so taking the capability from a role turns that role's tokens off at their next request. Breaking: a `member` can no longer mint a token, and a token a `member` already holds is refused with a 401. To keep a role's tokens working, grant it `user: ["create_tokens"]` in `roles`. Revoking your own token still needs no capability.
