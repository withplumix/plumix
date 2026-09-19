---
"@plumix/core": minor
---

Adds three ways to convert stored field values that aren't in the form their field declares. Such values are left by changing a field's type over existing rows, by an import, or by a direct write through `plumix/db`. Every reader returns them as stored, so a `toggle` holding `1` reads as off until it is converted. Each way uses the same rules a save does: a `"1"` under a `toggle` becomes `true`, a `"7"` under a `number` becomes `7`, and repeater rows and groups are converted too. A value no field type accepts is left as it is, as is a key no installed plugin declares.

- **Opening an item in the admin converts it.** Reading an entry, term or user through the admin writes back its converted values once. It leaves the last-edited time alone, so an editor's save token stays valid, and it can't overwrite a save that landed in between. Public reads never write: neither page renders nor the REST API.
- **A Field values admin page** under Management lists unconverted values per store, type and field across entries, terms, users and settings, and converts them in one action. It needs `settings:manage`. It works in batches, so it stays within D1's per-request query limit on Cloudflare. Values no field type accepts link to the items holding them, so they can be fixed by hand.
- **`plumix meta` / `plumix meta settle`** report and convert from the command line on a Node deploy, listing the ids of any values left for a human. On Cloudflare, D1 is only reachable inside the Worker, so the command points to the admin page instead.

A conversion is announced like any other meta change, so the CDN purges the pages it affects.

A repeater or group field holding the wrong shape, such as a string, is now reported as a value no field type accepts.

The handler a runtime adapter returns gains an optional `run(work, invocation)`, which runs core work against the site outside a request. It commits and purges even when the work throws. It is how `plumix meta` reaches the site's database; adapters that return core's handler get it without changes.

The core RPC namespace `meta` is new, so a plugin can no longer use `meta` as its id.
