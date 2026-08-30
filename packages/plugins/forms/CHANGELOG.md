# @plumix/plugin-forms

## 0.1.0

### Minor Changes

- [#2063](https://github.com/withplumix/plumix/pull/2063) [`fa1a0d7`](https://github.com/withplumix/plumix/commit/fa1a0d7657060e61a3f17df133f6e5e38cbccad7) Thanks [@nasyrov](https://github.com/nasyrov)! - Widens a form's field roster to the v1 set and teaches it fields that only sometimes apply.

  Alongside `text` and `email`, a form now takes `textarea`, `url`, `number`, `date`, `select` and
  `toggle` from `plumix/fields`, plus `tel` from `@plumix/plugin-forms/fields`. Each renders the
  control its answer needs and stores that answer in the shape the field declares — a `number` as a
  number, a `toggle` as a boolean, a `select` as one of the options the form offered. An answer the
  visitor never gave is absent rather than empty — except from the two controls that always answer,
  where an unticked checkbox is `false` and an unmade multiple choice is an empty list. So
  `FormAnswersOf<typeof yourForm>` is what a submission actually holds, and renaming a field breaks
  the build at its readers rather than in production.

  `tel` is the plugin's own contribution to the field vocabulary rather than a core built-in: it
  registers through `registerFieldType` and ships the admin renderer for it, so a `tel` field works
  anywhere a field does, meta boxes included. Making that possible without restating core's whole
  string chain is the one change in core — `StringMetaBoxField` and `StringFieldBuilder` are no
  longer bound to the five built-in string inputs, so a plugin contributing a string-shaped input
  reuses both. The built-in roster is unchanged, and such a field lands in the union exactly where a
  plugin-registered type already did.

  A field can now name a condition on a sibling, exactly as it would in a meta box:

  ```ts
  const plan = select("plan").options(["basic", "pro"]);
  const signup = defineForm("signup", {
    fields: [plan, number("seats").visibleWhen(plan.is("pro"))],
  });
  ```

  Core's own `isFieldVisible` judges it on both sides, and both judge a bag built the same way, so an
  untouched form is read exactly as it was served: the markup leaves out a field the form's defaults
  hide, and the submit handler drops one the submitted answers hide. A hidden field therefore never
  reaches the stored payload — nor the label snapshot — and is never held to its own `required`,
  even when something posts a value for it anyway. What the answers _reveal_ is kept, which is what
  will let a visitor whose script showed them a further question have its answer stored.

  `defineForm` now also runs the field checks a `register*MetaBox` call runs, published from core as
  `assertMetaBoxFields` beside the compile and projection pair it completes. A form is not
  registered, so nothing else was running them, and each one it skipped failed silently at submit
  instead: a field keyed `__plumix_hp` shadowed the honeypot and filed every answer as spam, two
  fields claiming one key dropped one of the two answers, and a condition naming a field the form
  does not declare hid its own field for good.

- [#2107](https://github.com/withplumix/plumix/pull/2107) [`18140f3`](https://github.com/withplumix/plumix/commit/18140f33c37fb346dc297179fe01f2792d41a350) Thanks [@nasyrov](https://github.com/nasyrov)! - Sets a retention period once for the whole site, and stops the nightly purge reading the whole table to find the tail it deletes.

  `forms({ retentionDays: 90 })` is now the period every form keeps its submissions for, so a site says once how long it is entitled to what its forms collect instead of repeating the number on each of them. A form declaring its own period still keeps that one, `0` included — on a form that is a declaration rather than an absence, and so the way one form opts out of a period the site set for the rest. Both default to keeping submissions indefinitely, which is the only default that cannot lose an enquiry nobody asked to lose.

  The nightly sweep now bounds each form by `id` as well as by date. `created_at` is in no index, so the old condition read the whole table — one form's arm walking that form's entire backlog, and several arms OR'd together dropping to a plain scan. Measured on 200,000 rows across three forms, it read all 200,000 to delete 703, and read all 200,000 again on a night with nothing to purge at all. It now reads 1,409 and 3. No index was added — a `(form, created_at)` one would have cost a b-tree insert on every submission and made the inbox's date-range filter 65× to 2,633× more expensive, for a further 2×.

  Ids are arrival order for every row the plugin writes, since a submission takes the column's `unixepoch()` default. A row backdated by a direct write to `form_submissions` or by an import sits outside that order: it is kept rather than deleted, and goes once the rows stored before it have expired too.

  The sweep also counts what it deleted off the driver rather than asking for every deleted id back. The first sweep after a site sets a period is unbounded, and 200,000 ids cost around 106 MB of heap to measure a number the driver was already holding — against a Worker's 128 MB limit. `plumix/db` exports the `rowsAffected` helper this needs, which reads the count off libsql's `rowsAffected`, D1's `meta.changes`, or a top-level `changes` for better-sqlite3, node:sqlite and bun:sqlite. It throws for a driver that reports no count at all rather than logging a zero it cannot stand behind — the demo runtime's `sqlite-proxy` adapter is one, though it registers no scheduled tasks for the purge to run under.

  `FormDefinition.retentionDays` is now `number | undefined` rather than `number`, since a form that declares no period is no longer the same thing as one that declared zero. Code reading the period off a definition should read it off the registry's `retentionDaysFor` instead, which folds in the site's own.

- [#2069](https://github.com/withplumix/plumix/pull/2069) [`9716e54`](https://github.com/withplumix/plumix/commit/9716e54354ccbd928dc9653bdfe1b29fc6a809ce) Thanks [@nasyrov](https://github.com/nasyrov)! - A form can now declare `bind` and carry the row whose page it was rendered on — an `entry`, a
  `term` or an `author` — so a subscribe form on a school's page knows which school without a
  developer threading an id through the block, the template or the theme.

  ```ts
  const subscribe = defineForm("subscribe", {
    bind: "entry",
    fields: [email("email").required()],
    onSubmit: ({ bound, answers }) => enrol(bound?.id ?? null, answers.email),
  });
  ```

  The value is resolved on the server at render, from the row the URL already matched, so binding
  costs no second lookup. It travels as a signed token — the kind, the id, and an HMAC over both
  _and_ this form — under a per-install secret generated on first use and kept in the settings table,
  so there is no environment variable and no binding to configure. Every other form system carries
  the bound value in a plain hidden input, one devtools edit from submitting against a different
  row; here the value and its signature travel together and the server reads the value back only out
  of a token it signed. Edit any part and the submission is refused, as is a token minted for one
  form and replayed against another, or one whose kind was rewritten — the slug and the kind are
  both inside what was signed, so entry 7's token cannot be posted as term 7.

  The verified `bound` reaches `validate` and `onSubmit` as `{ type, id }`, and is stored in the new
  indexed `bound_type` / `bound_id` columns rather than among the answers, so every submission for
  one row is a query rather than a scan — **run `plumix migrate generate` after upgrading**. Both
  columns are asked for together, because ids are unique only within their own table and because the
  index is partial: a query on `bound_type` alone falls back to a scan.

  ```ts
  const enquiries = await ctx.db
    .select()
    .from(formSubmissions)
    .where(
      and(
        eq(formSubmissions.boundType, "entry"),
        eq(formSubmissions.boundId, school.id),
      ),
    );
  ```

  The token is about the page rather than the visitor, so two renders of one page produce the same
  bytes and a page carrying a bound form stays edge-cacheable; for the same reason it does not
  expire, and the columns carry no foreign key, so a submission outlives the row it names.

  A bound form placed on a page of any other kind carries no token and stores nothing — a front
  page, a footer, an archive, a synced pattern, and equally a term page under a form that asked for
  an entry. Changing a form's `bind` has the same effect on pages the edge is still serving from
  before the change: the old token verifies, but its kind is no longer the one the form asks for, so
  the submission is accepted and stores nothing rather than handing a handler the wrong kind of id.
  Read `bound` as optional wherever the same form appears in more than one place.

  `plumix/blocks` gains the `BlockLoaderArgs` and `MaterializedAttrs` types, which a plugin
  declaring a block loader could not previously name.

- [#2084](https://github.com/withplumix/plumix/pull/2084) [`d689167`](https://github.com/withplumix/plumix/commit/d68916772872e5228d93acdbe07fd134bd817eb9) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds the plugin's own translation catalogs, so the submissions inbox and the block's editor entry
  read in the administrator's locale rather than always in English.

  The strings were already authored as Lingui descriptors, but with no `lingui.config.ts` and no
  `locales/`, `pnpm i18n:check` skipped the package and no translator could reach any of them. It now
  carries the same pipeline its peers do: `i18n:extract`, `i18n:compile` and `i18n:check` scripts, an
  `i18n` block on the plugin descriptor naming the catalog directory, and `en`, `uk`, `ar`, `de` and
  `zh-CN` catalogs covering all 52 descriptors. The compiled catalogs are in `files`, so an installed
  copy carries them rather than falling over on the consumer's `plumix build`.

  The rendered form is unchanged. A plugin has no catalog at render time on the public path, where a
  `Label` is flattened to its source message, so a visitor still reads the authored English — the ten
  descriptors it shows are in the catalogs, but nothing resolves them there yet. The validation
  messages beside them in `src/messages.ts` are still template-literal functions rather than
  descriptors: each needs an ICU message before a catalog can hold it, tracked in [#2083](https://github.com/withplumix/plumix/issues/2083).

- [#2075](https://github.com/withplumix/plumix/pull/2075) [`588d485`](https://github.com/withplumix/plumix/commit/588d485fc4bbc6e0ed71801a7e739e04f1334670) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds submission export as CSV and JSON, and a per-form retention period purged nightly.

  Both export buttons sit beside the inbox's filters and write exactly what is in view — the active form and status, and every submission under them rather than the page you can see. CSV leads with the envelope (received, form, number, status), then a column per question, then your note; JSON carries the whole row, answers nested as stored, with the entry the form was bound to, the hashed address, the user agent and any handler failure. Columns come from the rows' own label snapshots, so an export spanning two generations of a form names every column and a submission whose form has since been deleted still exports under the questions it was actually asked. Both come from `GET /_plumix/forms/export`, behind the same `form_submission:moderate` capability the inbox is. Because the columns come from the rows, an export is held whole in memory; past 20,000 submissions it is refused rather than truncated, asking you to narrow it.

  An exported answer opening with `=`, `+`, `-`, `@` or a tab is prefixed with an apostrophe, so a visitor who types `=WEBSERVICE("https://…")` into a name field has written text rather than a formula that runs on the machine of whoever opens the file. A number below zero is left alone.

  A form now says how long its submissions are kept, beside the fields that collect them:

  ```ts
  defineForm("contact", {
    fields: [text("name").required(), email("email").required()],
    retentionDays: 90,
  });
  ```

  One nightly scheduled task purges every form on the site, on `0 3 * * *` — declare that cron in your `wrangler.jsonc` for it to fire. `retentionDays: 0` keeps submissions indefinitely; past the period a submission goes whatever status it is under, since an archived enquiry is still someone's address. A slug nobody declares any more is left alone.

- [#2066](https://github.com/withplumix/plumix/pull/2066) [`7e0a96e`](https://github.com/withplumix/plumix/commit/7e0a96ef2947348bbc77bfeb258bf6a056af2d45) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds a form's own `validate` and `onSubmit`, a storage opt-out, a formatting helper, and two hooks for plugins.

  A form can now carry the checks the field builders cannot express and the thing to do with an accepted submission, both written beside the form they belong to:

  ```ts
  defineForm("enquiry", {
    fields: [
      text("name").required(),
      email("email").required(),
      number("guests"),
    ],
    validate: ({ answers }) =>
      answers.guests !== undefined && answers.guests > 4
        ? [{ field: "guests", message: "We seat four." }]
        : undefined,
    onSubmit: async ({ ctx, ...submission }) =>
      sendEnquiry(ctx, formatSubmission(submission)),
  });
  ```

  The order is validate, then store, then the handler, and a submission the spam floor caught reaches storage but not the handler — stopping the notification is what the floor is for. Persisting first is what makes a thrown handler safe: the submission is already on disk, the visitor is told their enquiry was received — because it was — and the failure is recorded on the row as `handler_error` for whoever reads the inbox. A form whose handler owns the destination can set `store: false` and keep validation, the spam floor and its handler with nothing written to `form_submissions`; doing that without an `onSubmit` throws, since that form would discard every submission it accepted.

  `formatSubmission({ answers, labels })` renders a submission as readable text — every answer under what its field was called, choices as their option labels, repeater rows one at a time — so a notification does not hand-roll formatting. It reads the row's own label snapshot, so it still renders correctly after the form is renamed.

  Two hooks cover what belongs across every form rather than in one. The `form:validate` filter is the last word before anything is written: it sees a submission every other check has accepted, and the errors it returns reject it exactly as a field rule's do. The `form:submitted` action fires after the row is stored and after the handler ran, carrying the row and the submission it came from.

- [#2064](https://github.com/withplumix/plumix/pull/2064) [`98c7d5a`](https://github.com/withplumix/plumix/commit/98c7d5a52143aba2d3c7ca2da0564613b02ea5a5) Thanks [@nasyrov](https://github.com/nasyrov)! - Enhances the rendered form with an island, validates every submission on the server, and commits to an accessibility contract.

  With JavaScript, submitting no longer reloads the page: the answers go over `fetch`, errors come back against the fields that produced them, and a confirmation replaces the form. The island renders the markup the server already sent rather than standing in for it, and marks it `data-plumix-form-enhanced` once it is driving it. Switch JavaScript off and the same markup posts to the same endpoint — a rejected submission comes back as the form again, carrying what the visitor typed, and correcting it returns them to the page the form was on.

  Every answer is now checked on the server whichever way it arrived: a required field must be answered, an email field must look like an address, and a field declaring `maxLength` is held to it. Errors are returned as `{ field, message }` and rendered the same way on both paths.

  The island fetches a short-lived timing token from `/_plumix/forms/token`, an endpoint nothing caches — fetched rather than rendered because the page carrying the form is edge-cached and can carry nothing about the visitor reading it. A submission completed implausibly fast is held as `spam`, the same way a filled honeypot is.

  Accessibility is a contract here rather than a review note: every control has a label that points at it, help text and errors are wired through `aria-describedby`, a failed control carries `aria-invalid`, a failed submit renders a live `role="alert"` summary and takes focus to it, and a required field is marked with a glyph as well as the `required` attribute — never by colour alone. An axe pass over the rendered form runs in the plugin's own end-to-end suite.

- [#2077](https://github.com/withplumix/plumix/pull/2077) [`455b7e6`](https://github.com/withplumix/plumix/commit/455b7e6beec0f852b44d73e4a3b37a725b0d0582) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds three read-only MCP tools, so a developer can ask an agent how many enquiries came in this
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

- [#2067](https://github.com/withplumix/plumix/pull/2067) [`1ac39ce`](https://github.com/withplumix/plumix/commit/1ac39ce710555cd3d7b94c9bcf1d24d923b5bfc8) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds multi-step forms: write `pageBreak()` among a form's fields and a visitor with JavaScript fills it in a step at a time.

  The break is an element of the flat field list rather than a level of nesting, so nothing else about a form changes — the answers type, a field's condition and the stored payload are the same whether or not the list is broken. The wizard is derived from the breaks at render time: `pageBreak("Your enquiry")` titles the step that follows it, and a step every answer leaves empty is skipped rather than shown as a page with nothing on it.

  Moving on checks only the fields the current step actually shows, against the same rules the server applies, and takes focus to the new step's heading. Progress — the step and every answer behind it — is kept in session storage, so a reload puts the visitor back where they were. A field whose condition names a driver on an earlier step is evaluated as the visitor moves forward, and one that condition hides is absent from the stored submission.

  Without JavaScript the same form renders as one long form and submits in one go, so the wizard is an enhancement rather than a requirement.

  New markup, all of it public API to style: `plumix-form-steps` / `data-plumix-form-steps` on the progress indicator and `plumix-form-step-marker` on each of its entries, `plumix-form-step` / `data-plumix-form-step` on the step on screen, `plumix-form-step-title` on its heading, and `plumix-form-back` / `plumix-form-next` on the two buttons that move between steps.

- [#2068](https://github.com/withplumix/plumix/pull/2068) [`6efa7d4`](https://github.com/withplumix/plumix/commit/6efa7d424e219bc99721edc57ac6aa66dce961ab) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds repeater and group fields to a form: as many rows as the visitor has things to say, and
  related questions namespaced under one key.

  ```ts
  const vegetarian = toggle("vegetarian");

  const rsvp = defineForm("rsvp", {
    fields: [
      group("contact").fields([text("name").required(), tel("phone")]),
      repeater("attendees")
        .fields([
          text("who").required(),
          vegetarian,
          text("dietary").visibleWhen(vegetarian.isOn()),
        ])
        .max(6),
    ],
  });
  ```

  Both are core's own builders, so a submission still types itself: that form stores
  `{ contact: { name }, attendees: [{ who, vegetarian, dietary? }] }`, and `FormAnswersOf` says so.
  They compose — a group inside a row, a repeater inside a group — and nothing about them is a
  premium add-on.

  A rule inside a row is judged against **that row's** answers rather than the whole form's, on the
  server exactly as in the markup, so one attendee's dietary note appears because that attendee is
  vegetarian and not because their neighbour is — and a sub-field the row hid is absent from that
  row's stored values however the body was written. A row nobody filled in is dropped rather than
  stored blank and is asked nothing, `.required()` sub-fields included; `.min()` and `.required()`
  therefore count the rows the visitor actually used, while `.max()` counts the rows that came back
  at all, since the form never renders more than it takes and a body that carries more is refused
  rather than read as far as the cap. A repeater declaring no `.max()` still has one — 100 rows,
  because the request body is the visitor's to write.

  Nested fields post under a bracketed name (`contact[name]`, `attendees[0][who]`), which is what an
  error names, what the summary links to, and what the `data-plumix-form-*` attributes carry. Rows
  are `<fieldset>`s with their own legend, and each carries one hidden marker — a repeater posts no
  value of its own, so the markers are how the handler counts the rows that came back. The label
  snapshot nests the same way, so a stored row stays readable after the form changes.

  With JavaScript the visitor adds and removes rows in place, keyed so that removing the row in the
  middle takes that row's answers with it and leaves its neighbours' where they are, and focus moves
  to the add button rather than being dropped with the row. Without it the form is served with the
  fewest rows the repeater accepts, and never fewer than one; a row past that floor carries no
  browser-side `required`, since the server asks a blank row nothing and a browser refusing to
  submit over a row nobody has to fill would strand a visitor who has no other way through.

- [#2073](https://github.com/withplumix/plumix/pull/2073) [`6e2c92f`](https://github.com/withplumix/plumix/commit/6e2c92fe6509e3a693f68b44e75af65842545429) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds the submissions inbox: one admin page under Content → Form submissions where an
  administrator works through what has come in, instead of relying on a notification email that may
  have bounced.

  The list is newest first and cursor-paginated, filtered by form and by status with a count beside
  each. Columns are read from each row's own label snapshot rather than joined to the live form, so a
  page mixing two generations of one form still names every column and a submission whose form has
  since been deleted still reads under the questions it was actually asked. The form filter offers
  what the registry declares now plus any slug that still has a backlog, which is how a retired
  form's submissions stay reachable.

  A submission whose `onSubmit` threw is marked as failed in the list, so the ones that owe someone
  something are findable without opening each in turn. Opening a submission shows every answer under
  its real label, the envelope it arrived in — when, which page's entry, the IP hash, the user agent
  — and the reason the handler did not finish. It can be marked read, archived or spam, or deleted;
  spam is a status rather than a discard, so a false positive is a click away from coming back, and
  deleting is the one thing on the page that asks first. A private note can be left for whoever picks
  the submission up next, stored in a new `note` column on `form_submissions` and never shown to the
  visitor.

  The page is behind a new `form_submission:moderate` capability, registered at editor level, and the
  list of forms comes from the plugin's own registry over its RPC router — no forms table and no
  admin manifest entry are involved.

- [#2070](https://github.com/withplumix/plumix/pull/2070) [`56b40bb`](https://github.com/withplumix/plumix/commit/56b40bb68f85a3659efb74c27a3b50ed0fad4b1c) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds two ways for a theme to render a form without the block. `PlumixForm` from
  `@plumix/plugin-forms/theme` puts a form into a template by slug, and
  `usePlumixForm` from `@plumix/plugin-forms/hooks` hands a theme's own island
  the form's fields, a typed submit call and `{ field, message }` errors — so a
  form that is mostly bespoke UI still gets validation, the spam floor and
  storage. A theme registering a block named `forms/form` still replaces the
  plugin's render outright.

- [#2061](https://github.com/withplumix/plumix/pull/2061) [`303c9de`](https://github.com/withplumix/plumix/commit/303c9dea5aa68a4db328384f0a7c149f8b8cf643) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `@plumix/plugin-forms`, which renders a form you declared in your own code and stores what visitors send.

  A form is a value in your repository, written with the field builders you already use for meta boxes and registered in `plumix.config.ts`. It deploys with the code that renders it, diffs in review, and reverts with `git revert` — there is no builder, no `forms` table, and no environment-local state to drift. A plugin can contribute one of its own through `ctx.registerForm`, and two forms claiming one slug fail at boot naming both contributors.

  The `forms/form` block server-renders static markup — the same bytes for every visitor, so the page carrying it stays edge-cacheable — and submits as a plain HTML `POST` that works with JavaScript disabled. The plugin ships no colour, type or borders; every part carries a stable class and data attribute.

  Each submission lands in `form_submissions` with a per-form serial, the answers, and a snapshot of what every field and option was called at the time, so the row still reads correctly after the form changes. The visitor's address is stored only as a salted hash, and a submission that fills the honeypot is answered like a real one and held as `spam`.

  This is the first slice: text and email fields only, and a submission is stored as it arrived — required fields and email format are not yet enforced on the server. Inline errors and the island, the full field roster, conditional visibility, multi-step forms, `validate` / `onSubmit`, translated catalogs for the plugin's own strings, and the submissions inbox and export arrive next.

- [#2072](https://github.com/withplumix/plumix/pull/2072) [`0b2f68b`](https://github.com/withplumix/plumix/commit/0b2f68b4ef819c90bd3667ff63bb024958ffc2c1) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds an opt-in Cloudflare Turnstile captcha, for the one form that is actually being attacked.

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

  The widget renders once, above the submit button, and on a form broken into steps only on the step that submits — a challenge solved two steps early is a token that may have expired by the time it is posted. It is rendered by the block and by `PlumixForm`, and not by `usePlumixForm`, which renders no markup at all, so a form driven from that hook should not declare one. A guarded form needs JavaScript, since Cloudflare's script is what draws the widget; that is the one place this plugin's no-script path stops, and a visitor with JavaScript off is told so where the challenge would have been rather than left at a box that never fills in.

  On submit, the challenge is verified with Cloudflare after the field rules and the form's own `validate` have passed and before the spam floor, so a visitor meets every mistake they can fix in one pass and a submission that was never going to be stored costs no subrequest. A submission that does not clear it is refused with a message the visitor can act on, and the island draws a fresh challenge so their retry has one to send.

  The check fails closed: a Cloudflare outage, a secret nobody set and an answer that did not decode all refuse the submission rather than waving it through, and which of them happened is in your logs. Rate limiting is deliberately not part of this — on Cloudflare that is a WAF rule, which beats counting rows in your database. A form that declares no `turnstile` is untouched and loads nothing from Cloudflare.

- [#2088](https://github.com/withplumix/plumix/pull/2088) [`f90a8a5`](https://github.com/withplumix/plumix/commit/f90a8a5422e169afd7d19a673581639e8abf1308) Thanks [@nasyrov](https://github.com/nasyrov)! - Makes the last of the plugin's visitor-facing copy translatable: every rejection a field can
  produce, the step counter, and a repeater row's heading and remove button. Ten strings that were
  template-literal functions are now ICU messages on descriptors, and `en`, `uk`, `ar`, `de` and
  `zh-CN` all carry them.

  The row-count messages are why this needed ICU rather than more descriptors. "1 entry" and "3
  entries" were built by picking a suffix, which is a rule English happens to follow and Ukrainian and
  Arabic do not — so the count now drives an ICU plural, and each catalog spells out the forms its own
  language uses: four for `uk`, six for `ar`, one for `zh-CN`. The out-of-range message is a single
  `select` rather than three ids, so a translator can see that "between 1 and 9", "5 or more" and "9 or
  less" are one sentence with a different tail.

  Rendering them reads the compiled source catalog through the package's own `./locales/*` subpath,
  the way core's admin bar does, rather than the descriptors' own `message`. That is deliberate:
  Lingui installs the parser that would read a raw ICU string only outside production, so on a
  deployed site the uncompiled route would put `{label} is required.` in front of a visitor. Compiled,
  the ICU is already parsed and no parser ships. A visitor reads the same English as before — the
  public render path still has no catalog to resolve against and this does not give it one. What
  changes is that the strings are now somewhere a translation can go.

### Patch Changes

- [#2062](https://github.com/withplumix/plumix/pull/2062) [`7b36faf`](https://github.com/withplumix/plumix/commit/7b36faf5b7a0a0bcc9f5db8a244464975a5ecd42) Thanks [@nasyrov](https://github.com/nasyrov)! - Adds `readVisitorMeta` to `plumix/db`: a request in, a salted per-install hash of the visitor's
  address and their truncated user-agent out. It is what a public submission handler needs to
  rate-limit or attribute without keeping the address itself, and `@plumix/plugin-comments` and
  `@plumix/plugin-forms` had each grown their own copy of it — the same hex encoder, the same lazily
  minted settings-row salt, the same `cf-connecting-ip` → `x-forwarded-for` → `"unknown"` ladder.

  The salt is minted on first use and persisted in the settings table, so an install needs no env var
  or KV binding to store hashed addresses; concurrent first-writes converge on one salt through
  `onConflictDoNothing` and a re-read. It takes the caller's namespace and keeps that namespace's salt
  in its own group, so no two callers share one — either's hashes would otherwise be matchable against
  the other's.

  To be clear about what the salt buys: it defeats a precomputed table of the IPv4 space and nothing
  more. It lives in the same database as the hashes, so it is no defence against someone who has
  already read that database.

  Also closes the hole that made keeping the salt off a settings _page_ meaningless. `settings.get`
  took any group name it was handed, so both plugins' salts were readable by anyone holding
  `settings:manage` — which is admin-wide, and mintable as a narrow API-token scope that has no
  business seeing them. A settings group whose name ends in `_internal` now means server-only rows:
  `settings.get` and `settings.upsert` refuse it, and `registerSettingsGroup` rejects the name at boot
  rather than letting a plugin build a settings page that fails on every load. Server-side readers are
  unchanged — this defends against a `settings:manage` holder, not against code running in the worker.

- [#2095](https://github.com/withplumix/plumix/pull/2095) [`8bdb8a3`](https://github.com/withplumix/plumix/commit/8bdb8a34dd366975b3e3bf967e0a3fbf63249381) Thanks [@nasyrov](https://github.com/nasyrov)! - Publishes the five helpers the forms and comments plugins had each written for themselves, and
  fixes a return-URL bug in `@plumix/plugin-forms` on the way.

  Each of the five was a fact about core's own wire format — the header its CSRF gate reads, the
  marker its islands bootstrap writes, the origin rule its dispatcher enforces — that a plugin had to
  rediscover. Core is now the one that says them.

  `resolveReturnUrl` on `plumix` resolves where to send a visitor after a form post the browser
  submitted, holding every candidate to an origin the site answers on and refusing the endpoint's own
  path, so the answer can be turned into neither an open redirect nor a loop.

  `useIsLive`, `documentBasePath` and `VISUALLY_HIDDEN_STYLE` join `plumix/blocks/renderer`.
  `useIsLive` is false through the server render and the first client render and true once a
  component is live, which is how progressive enhancement tells markup that shipped from JavaScript
  that ran. `documentBasePath` reads the subdirectory prefix off the islands bootstrap marker, for
  the callers `useBasePath` cannot serve because a hydrated island has no `PlumixProvider` context.
  `VISUALLY_HIDDEN_STYLE` is the `.sr-only` recipe inline, so hiding never depends on a stylesheet
  the page did not load.

  `CSRF_HEADER_NAME` and `CSRF_HEADER_VALUE` are now on `plumix/blocks`, alongside the existing
  export from `plumix`. They are defined in `@plumix/blocks` and re-exported by core rather than the
  reverse: the senders are islands, and a `"use client"` module reaching for `plumix` to name the
  header would pull the database, the authenticator and the dispatcher into a browser bundle.

  The forms fix: its own copy of the return-URL resolver parsed each candidate with no base and
  accepted only the configured origin. A relative `returnTo` — the natural thing for a template to
  pass — was refused outright rather than read as a path on the site, and on a multi-host deploy
  every candidate failed the origin test, so every submitter was sent to the site root. The shared
  resolver accepts both the request's origin and the configured one, which is the pair the
  dispatcher's own Origin check accepts.

  No public API was removed from either plugin; the copies were internal.
