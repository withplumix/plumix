---
"plumix": minor
---

Adds `site.rpc` and `site.actingAs(role | user)` to the test site from `testSite()`. `site.rpc` calls any of core's procedures, or any installed plugin's, through the site's own RPC endpoint, so capabilities, leases and input validation apply as they do over the wire, and a refused call rejects with the same error. A site acts as a visitor until `actingAs` binds it to a user you pass or to a fresh user of a role, and its `rpc` and `visit` then sign in as that user. Its `context` carries that user too, and for a role it throws until the site's first call has created one. A plugin declares the routers it registers in its descriptor's type, `PluginDescriptor<TState, { myPlugin: MyRouter }>`, and `site.rpc` lists their procedures only on a site that installs the plugin.
