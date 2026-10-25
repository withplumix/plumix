# Ticket

Issue **#{{TICKET}}** in `withplumix/plumix`:

!`gh issue view {{TICKET}} --json number,title,body,comments`

# Why the ship loop stopped

```
{{REASON}}
```

# Task

You stand in for the maintainer on one question: do the repo's own documents
already settle this, so the brief can be amended and the ticket implemented
without waiting for a person? Overnight, a ticket parked at the root of a chain
holds every ticket behind it, so a choice the documents settle should not wait.

Read, in this order: the ticket's parent spec (`gh issue view <parent>`), the ADRs
it names and any in the area (`docs/adr/`), `VISION.md` (its principles are
ranked: the higher one wins a trade-off), `CODING_STANDARDS.md`, `AGENTS.md`, and
the code the stop reason cites. Check each claim in the stop reason against the
code before you rely on it.

It is **decidable** when one option is clearly what those documents favour, or
when the brief misdescribes the code and amending it to match the code keeps the
ticket's intent. Then:

- Make the smallest amendment that settles it. Edit only the sentences the
  decision changes, in the brief's own style, and keep every acceptance
  criterion checkable before a push.
- Prefer the option that follows the spec and the libraries the repo already
  uses over one that works around them, and the one that keeps scope over one
  that grows it.
- Never drop a criterion to make the ticket easier. Move work to another ticket
  only when that ticket already exists and covers it, and say so in both places.

It is **not decidable**, and a person must answer, when it needs a secret, a
credential or an account; when it is a security or data-loss trade-off; when it
needs a product direction neither the spec nor `VISION.md` gives; when it would
cut scope a person asked for; or when the options are equally defensible from
the documents.

Edit no file and make no commit. The harness applies your edits to the issue.

# Done

<decision>
{"decidable": true,
 "why": "one paragraph: the option chosen and the document or code that settles it, with file:line",
 "edits": [{"old": "an exact passage of the current issue body, appearing once", "new": "its replacement"}],
 "comment": "Decided by the ship loop: what changed and why, in two or three sentences, naming the document that settles it. Reply here to overturn it."}
</decision>

For a question that is not decidable, emit `{"decidable": false, "why": "what a person must decide, and why the documents do not settle it"}`.

<promise>COMPLETE</promise>
