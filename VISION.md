# Vision

Plumix is a TypeScript CMS for content sites. The developer writes the content model, the blocks
and the theme in code. The people who run the site write, design and publish in an admin and a
visual editor, by hand or through an AI agent, and only ever with the blocks and design tokens the
developer allowed. The site runs on the runtime the developer picks, its content stays in its own
database, and nobody's work is silently overwritten.

This file says who Plumix is for, what it never trades, how it decides, and what 1.0 means. When a
proposal is unclear, the answer comes from here. [`ARCHITECTURE.md`](ARCHITECTURE.md) draws the
system that delivers it, and [`CODING_STANDARDS.md`](CODING_STANDARDS.md) says how the code is
written.

## Who Plumix is for

Plumix is for the TypeScript developer building content sites, often for clients. The developer
chooses it and supplies the blocks and design tokens; the people below work with them every day.

A disagreement is settled by which side it falls on:

- **Code belongs to the developer**: the content model, the plugins, the blocks, the design
  tokens, the config and the APIs.
- **The running site belongs to the people who work in it.** The admin and the visual editor
  behave the same on every site, meet WCAG 2.2 AA, and hold the floor below for them. A developer
  choice can narrow what they may do, never make it unsafe. An agent working for them gets the
  same guarantees and the same limits as a person, never more.

## Actors

[`GLOSSARY.md`](GLOSSARY.md#people) defines each one.

- **People.**
  - **Developer:** builds, deploys and runs the site, and may publish plugins and themes for
    other sites.
  - **Editor:** writes and publishes content.
  - **Designer:** composes pages and reusable patterns from the developer's blocks and design
    tokens.
  - **Site admin:** manages users and settings; on a client site, usually the client. Exports,
    migrations and upgrades are a developer's job.
  - **Member:** has an account on the public site, and never sees the admin.
  - **Visitor:** reads the public site anonymously.
- **Software.**
  - **Agent:** an AI client working over MCP with an API token, or the in-editor agent working for
    the editor who asked.
  - **API client:** reads published content over REST, anonymously or with an API token, and
    sees only what that token's owner may read.

## The floor

Plumix keeps these on every release, whatever else is traded. A change that breaks one is a bug,
however much it gains.

- **Nobody sees what they may not.** A page made for one person is never cached and shown to
  another, and Plumix sends nothing anywhere the site did not configure. Core sets no cookie on a
  public page for an anonymous visitor.
- **Work is never lost.** A save made against a stale copy is refused, never applied over someone
  else's work, and the writer keeps their unsaved edits. An entry type with revisions keeps each
  saved version, and any one can be restored.
- **Content stays the site's.** Plumix is MIT-licensed. An upgrade never loses stored content. A
  site's content lives in its own SQLite database, and any developer, not only the one who built the
  site, can export all of it with one command in a documented format.
- **A person's data is theirs.** A site admin can export or erase everything the site stores about
  one person.

## How Plumix decides

The floor beats everything. The running-site rule beats every principle. Between principles, the
higher one wins, and it wins on a shown call site or failure, not on a claim.

1. **Developer happiness.** In code, the developer is the user we design for.
   - Design a public API from the call site a developer writes.
   - No cast and no `declare module` to use a Plumix API. A type argument only names the
     developer's own declaration (`typeof contact`).
   - An error names what is wrong and what to write instead.
2. **Decisions, not options.** A config key or setting left out gives the common case. A new one
   needs two kinds of site that want opposite answers. Any other need goes through a seam, a
   documented extension point any plugin can use, not a flag.
3. **Mistakes fail early.** A wrong config, model or descriptor fails at type-check, build or boot,
   the same on every request, never only on the request that reaches it.
4. **One tool per job.** Plumix builds directly on drizzle, Lingui, React and Vite, with no layer
   to swap them. A site changes what Plumix does through its runtime adapter, its config slots,
   its plugins and its theme.
5. **One app, every runtime.** Core speaks web standards (`Request`, `Response`) and behaves the
   same on every runtime. A site needs no service its runtime does not provide: a feature that
   needs one sits behind a config slot, with an in-process default or off until the site fills it.
   An adapter is supported when it passes the shared conformance and end-to-end suites on its own
   runtime.
6. **Fast by default.** A page that does not depend on who is asking is server HTML a CDN can
   cache. A page with no island ships no client JavaScript, and a public form or link works before
   any script loads. Core's primitives render HTML that meets WCAG 2.2 AA, because a theme cannot
   fix markup it did not write.
7. **No shortcuts for first-party code.** Core's own features and the first-party plugins use only
   seams a third-party plugin can use. When a site or a first-party plugin has to work around a
   seam, the seam is what's missing.

## What Plumix gives its users

- **Visual page building inside the developer's system.** The developer keeps the list of blocks
  the editor offers, core primitives included, and sets the style policy: custom values allowed,
  or design tokens only. A layout the blocks cannot express is new code from the developer, not a
  setting.
- **Agents author like editors.** An agent drafts, edits and publishes content and composes pages,
  held to an editor's rules: the allowed blocks, the style policy, edit leases and capabilities. It
  acts for the person whose token it holds, never with more capabilities than that person has now,
  and revoking the token stops it. It never takes over a lease someone else holds; it waits. A
  refused write names its cause. Every change it makes is a
  revision naming the agent and that person, and is undone like an editor's.
- **Roles a site defines.** A role is a set of capabilities, and nothing ranks one above another.
  Core ships member, author, editor and admin. A site adds its own, such as a layout role that may
  change a page's blocks but not publish, instead of waiting for core.
- **Content in every language the site speaks.** An entry has a version per enabled locale, and
  the public site, the admin and the APIs serve each one.
- **A site that reaches other systems.** Webhooks declared per entry type tell other systems when
  content changes, and telemetry exports to any OpenTelemetry endpoint.

## Where a feature goes

Ask in order, and stop at the first yes:

1. Does it change what the site is (its plugins, runtime, secrets or schema), or is it run by
   whoever operates the server (migrations, sync, mail tests)? It is a CLI command or a config key,
   never an admin screen
   ([ADR 0034](docs/adr/0034-an-operator-task-is-a-cli-command-or-config-not-an-admin-screen.md)).
2. Does it need one runtime's primitives? It goes in that runtime's adapter, filling a core slot;
   on other runtimes it is off and the admin does not offer it
   ([ADR 0019](docs/adr/0019-a-runtime-adapter-uses-its-runtimes-primitives-and-is-tested-on-that-runtime.md)).
3. Would a site break the floor or produce wrong output without it? It is core
   ([ADR 0002](docs/adr/0002-core-owns-what-would-be-wrong.md)).
4. Otherwise it is a plugin, which the scaffolder preselects when most sites want it. Code that
   fills a slot with an outside service is its own package, never core. When the existing seams
   can't carry a plugin, core adds the seam, not the feature.

## What Plumix is not

- Not a general app framework or a backend-as-a-service. Sign-in and account pages serve a content
  site, not a product's screens.
- Not headless-first. REST and MCP serve other apps and agents; the theme is the primary output.
- No schema builder in the admin. The content model lives in TypeScript.
- No content types in core. Posts and pages come from plugins or site code.
- No public-site design in core beyond the welcome page a site shows before it has a theme.
- React only, for themes and the admin.
- No auto-imports and no hidden globals. Every Plumix name a site uses is imported from a `plumix`
  subpath or a plugin's own exports.
- One install serves one site. Running many sites means running many installs.
- No database other than SQLite. Every runtime provides one: a file, the platform's service, or a
  libsql server.
- No password sign-in from core or a first-party plugin. People sign in with a passkey, an emailed
  link, an invite or an outside account (OAuth).

## What 1.0 means

1.0 is a promise: a site or plugin built on `1.x` keeps working on every later `1.x`, with no
change to its code. Plumix tags it when all of these hold.

- **The design is built.** The code does what this file and [`ARCHITECTURE.md`](ARCHITECTURE.md)
  describe, and the goals above work end to end.
- **The floor holds,** and no security advisory is open.
- **The surface is frozen.** The published exports, hook names and config shape, REST v1's routes,
  envelope, errors and OpenAPI document, and each MCP tool's name and input schema are in a
  committed API snapshot, and it shows no break across the last three minors. The fields inside
  an entry are the site's content model, not Plumix's contract.
- **Everything published is finished.** An unfinished API stays unexported, before 1.0 and after.
  There are no unstable subpaths and no experimental flags.
- **Every interface says who implements it.** The published-surface roster records whether Plumix
  or the site implements each one. Plumix may add members to one it implements; adding a member to
  one a site or plugin implements is a breaking change.
- **Every runtime passes.** Each adapter passes the conformance suite and its own end-to-end suite
  on its real runtime.
- **Upgrades are proven.** A CI check upgrades a site built on the previous minor and finds its
  database, migrations and content intact.
- **It has run in the field.** A production site moved from another CMS has run on the published
  packages, unpatched, across at least two minors.
- **It is documented.** Every subpath has docs, and the changelog gives each break of the 1.0 cycle
  with its migration.

Before 1.0, the floor holds on every release, and any other part of the published surface may break
in a minor. After 1.0, versions follow semver: a major breaks, a minor adds, a patch fixes. Every
fix, security fixes included, lands on the latest release only, so a site stays supported by
upgrading; [`SECURITY.md`](SECURITY.md) gives the response times.

Real-time co-editing comes after 1.0, and it builds on the edit lease rather than replacing it: a
second editor joins the holder's session instead of taking over
([ADR 0048](docs/adr/0048-core-guards-every-edit-with-a-required-token-and-an-enforced-lease.md)).
