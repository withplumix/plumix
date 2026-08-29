---
"@plumix/plugin-forms": minor
---

Adds three read-only MCP tools, so a developer can ask an agent how many enquiries came in this
week and get an answer without opening the admin.

`form_list` names every form the site declares, read from the plugin's own registry — a form is a
value in the repository, so there is no table to query and no manifest entry to keep in step with
one. `form_describe` returns one form's shape: each question, the control it renders, what an
answer to it stores, whether it is required, a choice field's options, a group's or a repeater
row's own fields, and where the list breaks into steps. A field the form only sometimes asks is
marked conditional, which is what explains a submission that carries no answer for it. The
description also reports whether the form stores submissions, how long it keeps them, what it binds
from the page it sits on, and whether it is behind a captcha — never the Turnstile site key, and
never the secret.

`form_submission_list` queries stored submissions newest first, filtered by form, by status and by
when they arrived. Both date bounds are inclusive and a bare `2026-08-24` names the whole UTC day,
so `since: "2026-08-24", until: "2026-08-30"` is the week a person means rather than one that
quietly loses its last day. An instant is taken as written but has to carry its zone, so the same
argument cannot mean two things on two machines. Alongside the page it returns a `total` counting
everything the filters match, which is what answers "how many" without paging to the end.

All three are behind the same `form_submission:moderate` capability the inbox is, clamped to what
the calling token may read: knowing a form exists is of no use to a caller that may not read what
was said through it.

There is deliberately no write tool, and there will not be one. A form deploys with the repository
that declares it; a tool that mutated one would create exactly the environment drift this plugin
exists to avoid, and would do it faster than a person could review. An agent changing a form is an
agent editing a file, where the typechecker, the diff and `git revert` all still apply.
