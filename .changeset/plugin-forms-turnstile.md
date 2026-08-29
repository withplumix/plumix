---
"@plumix/plugin-forms": minor
---

Adds an opt-in Cloudflare Turnstile captcha, for the one form that is actually being attacked.

Every form already meets a spam floor it cannot turn off — a honeypot and a timing check. Turnstile is the third defence, and it is declared per form rather than imposed on all of them:

```ts
defineForm("contact", {
  fields: [text("name").required(), email("email").required()],
  turnstile: {
    siteKey: "0x4AAAAAAA…",
    secret: (env) => env.TURNSTILE_SECRET,
  },
});
```

The secret takes core's environment-input union, so `(env) => env.MY_SECRET` reads it from the per-request bindings on Cloudflare Workers, where the config module is evaluated long before any request. It cannot reach a browser: `FormWire` declares `secret?: never`, so handing a form definition straight to a renderer or the island is a compile error and only what `toFormWire` built can cross.

The widget renders once, above the submit button, and on a form broken into steps only on the step that submits — a challenge solved two steps early is a token that may have expired by the time it is posted. It is rendered by the block and by `PlumixForm`, and not by `usePlumixForm`, which renders no markup at all: a form driven from the headless hook should not declare one. A guarded form needs JavaScript, since Cloudflare's script is what draws the widget; that is the one place this plugin's no-script path stops, and a visitor with JavaScript off is told so where the challenge would have been rather than left at a box that never fills in.

On submit, the challenge is verified with Cloudflare after the field rules and the form's own `validate` have passed and before the spam floor, so a visitor meets every mistake they can fix in one pass and a submission that was never going to be stored costs no subrequest. A submission that does not clear it is refused with a message the visitor can act on, and the island draws a fresh challenge so their retry has one to send.

The check fails closed: a Cloudflare outage, a secret nobody set and an answer that did not decode all refuse the submission rather than waving it through, and which of them happened is in your logs. Rate limiting is deliberately not part of this — on Cloudflare that is a WAF rule, which beats counting rows in your database. A form that declares no `turnstile` is untouched and loads nothing from Cloudflare.
