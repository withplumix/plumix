# A redirect status is chosen by the framework

Two requests asked for a redirect's status to match a site's previous stack.
#2833 asked for `auth.loginRedirect: { status, param }`, because eduscope.uk's
live site sends an anonymous visitor on with a 307 to `?callbackUrl=`, where
the sign-in gate sends a 302 to `?redirectTo=`. #2839 asked for a 301 or 308
option on the canonical normaliser, because the Next.js predecessor answered a
trailing slash with a 308.

> **Plumix chooses the status of the redirects it makes itself. The sign-in
> gate answers 302 to `loginPath?redirectTo=<path>`, and the canonical
> normaliser answers 301. Neither status nor the gate's return parameter is
> configurable. A site that needs another status for a URL shape writes a
> `config.redirects` rule, and a theme's sign-in page that needs a legacy
> return parameter reads it itself.**

## What this means

- **Only `GET` and `HEAD` reach a public route.** `routePublicRequest` answers
  any other method with a 405 before it routes
  (`packages/core/src/route/index.ts:58-61`). 301 and 308 differ only in
  whether the browser may turn a non-`GET` request into a `GET`, and so do 302
  and 307. For `GET` and `HEAD` they behave the same, and search engines treat
  301 and 308 alike, and 302 and 307 alike. An option would be permanent API
  surface for a number that changes nothing a visitor or a crawler does.
- **The gate's redirect.** `gateToResponse` answers a `redirect` gate with
  `redirectTo()`, a 302 sent `private, no-store` and `Vary: cookie`
  (`packages/core/src/access/gate.ts:88-94`,
  `packages/core/src/runtime/contract/http.ts:64-70`). `loginRedirect` sets
  exactly one `redirectTo` parameter (`packages/core/src/access/gate.ts:104-110`).
- **The canonical normaliser's redirect.** A non-canonical shape gets
  `permanentRedirect()`, a 301 (`packages/core/src/route/index.ts:79-82`,
  `packages/core/src/runtime/contract/http.ts:79-81`).
- **The return parameter belongs to the sign-in page.** Nothing in core reads
  `redirectTo` back off the login page's URL. The sign-in methods take it as
  their own input: `authClient.signIn.magicLink({ email, redirectTo })` posts
  it (`packages/core/src/auth/client/core-methods.ts:22-31`), and `url()` puts
  it on an OAuth start link. The server validates whatever arrives, keeping a
  root-relative path inside the base path and answering anything else with the
  site root (`packages/core/src/auth/method-kernel.ts:63-67`,
  `packages/core/src/auth/redirect.ts:48-58`). So a theme's sign-in page that
  reads `?callbackUrl=` and passes it on as `redirectTo` honours every
  bookmark that carries the old name.

## Migration recipes

**A legacy return parameter.** A theme's sign-in island reads the old name and
hands it to `authClient`:

```tsx
import { authClient } from "plumix/auth/client";

const redirectTo =
  new URLSearchParams(location.search).get("callbackUrl") ?? undefined;

await authClient.signIn.magicLink({ email, redirectTo });
const githubHref = authClient.url(
  { method: "oauth", route: "github/start" },
  { redirectTo },
);
```

**A 308 for a legacy shape.** `config.redirects` rules run before the canonical
normaliser (`packages/core/src/route/index.ts:67-70`) and take any of 301, 302,
307 and 308 (`packages/core/src/route/contract/redirects.ts:7`). A site whose
old course pages answered a trailing slash with a 308 writes that rule itself:

```ts
export const redirects: PlumixConfigInput["redirects"] = [
  { from: /^\/courses\/(.+)\/$/, to: "/courses/$1", status: 308 },
];
```

## Considered options

- **`auth.loginRedirect: { status?: 302 | 303 | 307, param?: string }`**
  (#2833, rejected). The status changes nothing for a `GET`. The parameter name
  matters only to the theme's sign-in page, which can already read any name,
  and a configured name would have to be threaded through every sign-in method
  for no gain.
- **A status option on the canonical normaliser** (#2839, rejected). A 308
  behaves as a 301 for the only methods that reach it, and a `config.redirects`
  rule already gives a site a 308 on the shapes it cares about.
- **A status knob per redirect.** Each redirect Plumix makes would grow its own
  option, every one of them for response-level parity with a previous stack
  rather than for behaviour. One decision covers them all.
