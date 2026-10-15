# A sign-in method is a registered extension

A theme that built its own sign-in page had no supported way to drive
Plumix's auth flows (#2970). It hand-built the endpoint URLs, the base path,
the `X-Plumix-Request` header and `redirectTo`, and `documentBasePath()`
returns `""` during server rendering, so a hand-built href dropped the base
path. The admin had typed wrappers, but they were private to it. Sign-in
methods were hardwired in core's auth config, so a plugin couldn't add one
(SAML, a wallet, an enterprise IdP).

> **Sign-in is closed for modification and open for extension. A method only
> proves identity; core decides everything else. Core and every plugin declare
> a method the same way: `defineAuthMethod` for the server half, and a
> `defineAuthMethodClient` half that `authClient` from `plumix/auth/client`
> mounts as `authClient.signIn.<name>`. `authClient` is a small kernel: the
> transport, the session, `url()` for plain forms, and two hooks. Calls
> resolve `{ data, error }` and never throw for an expected failure. There are
> no ready-made components.**

## What this means

- **A method proves; core decides.** A method's handler ends in the kernel's
  `proveIdentity`, with an email proof (`{ email, emailVerified }`) or an
  account proof (`{ userId }`). Core keeps every identity rule: the allowed
  domains and `selfSignup`, the bootstrap gate, disabled accounts, session
  issuance and `user:signed_in`. A method can't mint a session any other way.
- **One public kernel, core's methods included.** Core's passkey, invite,
  magic-link and OAuth methods are declared with `defineAuthMethod` and run
  through the same `AuthMethodKernel` a plugin's do. None has a privileged
  path.
- **Answers chosen by transport.** A fetch carrying `X-Plumix-Request` gets
  JSON: `{ userId, redirectTo }` on success, `{ error }` with a status on
  failure. A navigation gets a `302`, a form post a `303`, landing on the
  `redirectTo` or on `loginPath` with `<key>_error=<code>`.
- **`formPost`.** A route opts into a same-origin POST without the header,
  run with no ambient principal, so a sign-in form works with no script.
- **The `redirectTo` rule.** The server keeps a root-relative path inside the
  base path, sends anything else to the site root, and sends an absent one to
  the admin. `authClient` takes it app-relative (`/account`) and adds the base
  path before it goes on the wire. A fetch sign-in navigates only when the
  call passed `redirectTo`, to the value the server answered with. Without one
  the page stays and `useSession` updates with no reload.
- **Core routes vs methods.** A method mounts at `/_plumix/auth/<name>/`.
  Core's own `device`, `signout` and `verify-email` routes are reserved names
  no method may take, and two owners of one name fail the boot.
- **No rate limiter in the kernel.** Throttling depends on the deploy's edge,
  storage and threat model. A method that needs one, or the site in front of
  it, owns it.
- **The kernel/seam split.** `authClient` owns the base path (from the render
  context, so it holds in an island and during server rendering), the CSRF
  header, `credentials: "same-origin"`, the `{ data, error }` envelope, the
  session refresh after any call that signs someone in or out, and
  `url(target, { redirectTo })`. A half gets a kernel bound to its mount and
  returns `{ signIn, ...extra }`. `signIn` appears under the camelCase of the
  method's name, the rest under `authClient.<camelCase>`. Lookup happens when
  called, so a half registered after its action was read still runs.
- **Typed by registration.** `AuthMethodRegistry` is filled by
  `declare module "plumix"` from the plugin's main entry, which reaches the
  theme through `plumix.config.ts`. No `.d.ts` is generated, so typecheck
  never needs a dev or build run first. OAuth providers type the same way:
  the site's config augments `OAuthProviderRegistry` with
  `OAuthProvidersOf<typeof config>`.
- **Mounted by the build.** `defineAuthMethod({ client })` names a
  browser-safe module. The Vite plugin reads every `client` from the loaded
  config and generates their imports into the islands renderer entry, which
  an island awaits before it mounts, and into the admin's site bundle, where
  `plumix/auth/client` is a shared runtime shim so every half lands on the
  admin's one `authClient`.
- **`{ data, error }`, no components.** `error` is `{ code, message }`, the
  server's code and a translatable descriptor. A theme composes its own
  markup from `useSession`, `useAuthMethods` and the calls.

## Considered options

- **Ready-made sign-in components** (rejected). Every theme's sign-in page
  looks different, and a component would need props for every variation.
  The calls and two hooks are what a component would be built from anyway.
- **A fixed client of core's methods only** (rejected). It keeps the server
  open and the client closed, so a plugin's method would still need
  hand-rolled calls.
- **Mutation hooks** (`useSignIn`, rejected). They tie the client to one
  React data-fetching style. A call returning `{ data, error }` drops into
  `useTransition`, TanStack Query or a plain handler alike.
