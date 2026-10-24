# ctx.fetch is bounded by default

`fetch` waits forever by default, so an upstream that never answers hangs the
request or the scheduled task that called it. Every author had to remember a
timeout. Core and the first-party plugins remembered three times, each with its
own constant (image rules, the forms plugin's Turnstile check, the SEO plugin's
IndexNow ping), and every other call (the mailer, CDN purges, the OAuth token
exchange, author code) relied on the upstream answering (#3266).

> **Every `ctx.fetch` call is bounded: it rejects after 10s on every runtime.
> A call passes `{ timeout: ms }` to tighten or loosen that, or
> `{ timeout: false }` to lift it for a long download. A call that runs out
> rejects with the standard `DOMException` named `TimeoutError`, and its
> traced-fetch span records the timeout and its duration.**

## What this means

- **`timeout` is a Plumix init key.** Core removes it before it calls the
  platform `fetch`, which never sees it.
- **The caller's signal still works.** Core combines it with the timeout and
  the context's `ctx.signal` through `AbortSignal.any` and
  `AbortSignal.timeout`, so the call aborts on whichever fires first. A
  caller's abort rejects with that signal's reason; a `Request` input's own
  signal counts as the caller's.
- **No Plumix error class.** A timeout is a `DOMException` named
  `TimeoutError`, the error `AbortSignal.timeout` produces, so existing
  handling and third-party libraries recognise it. Its message names the
  duration (`timed out after 10s`).
- **The span says so with no further wiring.** A timed-out call's span has the
  `error` status, and its error is that `TimeoutError` and message, so the
  debug bar, the request history and the MCP tools show it as they show any
  failed span.
- **The span and its message cover the call until the response arrives.**
  Core hands the combined signal to the platform `fetch` and does not trace or
  reword the body read that follows. Whether that read honours the deadline is
  the platform's behaviour, not one core tests or promises.
- **Global `fetch` stays the platform's.** The bound applies to `ctx.fetch`
  only; code that calls `fetch` directly gets no timeout.

## Considered options

- **Leave it to each caller** (today's state). Rejected: a forgotten timeout is
  invisible until an upstream hangs, and three hand-rolled ones already drifted
  apart.
- **A runtime-specific default**, such as the platform's own limits on
  Workers. Rejected: a Node or Bun server has no such limit, and one number on
  every runtime is what an author can reason about.
- **A Plumix `FetchTimeoutError` class.** Rejected: it would not match the
  `TimeoutError` checks that libraries and authors already write.
