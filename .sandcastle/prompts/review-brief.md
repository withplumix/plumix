# Task

Below is a specification an unattended agent will implement without ever seeing
the discussion it came from. You are that agent's cold start: the brief and this
repository are all you get, which is the point — you cannot ask, so anything the
brief left implicit shows up here as a thing you cannot determine.

Plan the implementation. Explore the repo as far as you need. Do not edit any
file, do not commit.

---

{{BRIEF}}

---

Then report only where the brief itself failed you:

- a criterion you cannot tell how to verify — **high**
- a named type, signature or behaviour you cannot find or that reads differently
  than the brief describes — **high**
- a decision the brief leaves to you that changes the public surface, the schema,
  or what a consumer sees — **high**
- ambiguity you could resolve by reading the code, but that cost you a detour —
  **medium**
- wording — **low**

A brief you could work from is an empty array. Do not review the *design* it
describes, and do not report what is merely absent from a brief that is already
sufficient; only report what blocks you.

# Output

`file` is the path you were looking at when the gap bit, or `brief` if the gap is
in the text itself.

<findings>
{"findings": [{"file": "brief", "severity": "high", "summary": "one sentence", "why": "what you could not determine, and what you would have had to guess"}]}
</findings>

<promise>COMPLETE</promise>
