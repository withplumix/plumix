---
"@plumix/core": minor
---

Add an opt-in `auth({ selfSignup: { defaultRole } })` switch that opens public
registration.

Self-service signup was gated to the `allowed_domains` allowlist, so "anyone can
register as a subscriber" meant re-implementing the flow from primitives. With
`selfSignup` set, a first-time verified email through the built-in magic-link or
OAuth flows provisions a new user at `defaultRole` regardless of
`allowed_domains`:

```ts
auth({ passkey, magicLink, selfSignup: { defaultRole: "subscriber" } });
```

Omit it (the default) and signup stays domain-gated exactly as before. The
bootstrap rail is unchanged — the first admin still enrols via passkey (or
`bootstrapVia: "first-method-wins"`), and self-signup never mints the first user
on an empty deploy.

Because enabling this turns the magic-link request endpoint into a public signup
surface, issuance is now rate-limited: at most five magic-link tokens per email
within a 15-minute window. Over the cap the request is a silent no-op, so the
endpoint stays timing- and shape-uniform for registered vs unregistered emails
and can't be turned into an email-bomb amplifier or an enumeration probe.
