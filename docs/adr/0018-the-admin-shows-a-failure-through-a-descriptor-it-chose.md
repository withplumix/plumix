# The admin shows a failure through a descriptor it chose

With no `storage:` slot, the media library's upload banner read **Conflict**.
The library had friendly copy for exactly that failure, but it looked the copy
up by the caught error's `message`, and oRPC fills `message` with its own
English name for the status code when a procedure sets none. The reason the
copy was keyed on lives in `data.reason`, and nothing read it (#2516).

Around fifteen other admin error mappers ended the same way:
`if (err instanceof Error) return err.message`, justified as carrying a plugin
author's text to the screen. That text cannot arrive. A hook's throw reaches the
client as oRPC's masked "Internal Server Error", and no procedure sets an
explicit message. What reached the screen was oRPC's code text, the demo gate's
"Not available in the demo", or a network or parser complaint, all English and
none written for the person reading it.

> **The admin shows every failure through a localized `MessageDescriptor` it
> chose. A caught error's `message` is never rendered. An error state that holds
> a failure to show is typed `MessageDescriptor | null`, so the text has nowhere
> to be stored.**

- **RPC failures map by reason.** `describeRpcError(error, reasons, fallback)`
  from `plumix/admin` returns the table's descriptor for `data.reason` and
  otherwise the site's own fallback. It never reads `message`. On the fallback
  path it `console.error`s the original, so a developer keeps the detail the
  screen drops. `rpcErrorReason` and `rpcErrorCode` are there for a mapper that
  needs a code as well.
- **Authored text sent as data is fine.** The meta field errors a procedure
  returns carry a `Label` the server's author wrote for the screen. That is
  content in a response's `data`, not a caught error's text.
- **There is no plugin-author message channel through an error's text.** A
  plugin that wants its own copy on screen sends a reason, and its admin code
  maps the reason to its own descriptor.
- **A render boundary may show a client exception as secondary detail.** The
  admin's error boundary and the plugin error boundary catch a component that
  threw, where no descriptor names the failure. Each keeps its localized heading
  and may show the exception's text beneath it, and each read carries a
  `// Shown verbatim: …` comment saying why.

`plumix/no-error-message-in-ui` holds the line. It reads types, so it reports
`.message` read off an `Error` or any subclass, `query.error` and
`mutation.error` included, in the admin packages and every plugin's `src/admin/`.
An argument to `console.*` is exempt, and so is a statement with the
`Shown verbatim:` note directly above it, which has to be a sentence.

## Considered options

- **Keep the string branch for plugin authors** (rejected). The channel it
  served does not exist on the wire, and keeping it kept the path the
  untranslated code text took to the screen.
- **Map `message` through the table** (rejected). That was the media library's
  design. oRPC's text is the code's name, never the reason, so the lookup could
  not match, and the reason was sitting unread in `data`.
- **Translate oRPC's code text** (rejected). "Conflict" in a user's language
  still says nothing about what failed. The site knows what it was doing, so the
  site picks the fallback.
