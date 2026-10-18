# An operator task is a CLI command or config, not an admin screen

The admin grew screens for work only whoever deploys a site does: **Management →
Field values** settles stored values after a field's type changes or an import
(#2843), the allowed sign-up domains are a list kept in the database (#2841),
and the mailer's test send is a button (#2842). None of it is editing a site's
content or its people. The Field values page existed only because `plumix meta`
could not reach D1 from a Node process, so on Cloudflare, the default runtime,
the admin was the only way to settle values.

> **An operator task, done once per environment by whoever deploys the site, is
> a CLI command or a config key, not an admin screen. The admin is for editing a
> site's content and people.**

## What this means

- **A command reaches every runtime's database.** A CLI command that needs the
  site runs core's work through the site's own handler (`PlumixHandler.run`),
  against the env the runtime's `RuntimeMigrations.openRun` returns. It opens
  the database `plumix migrate` would, with the same target options,
  `--binding` rule and errors. Each adapter builds that env on its own
  primitives (ADR 0019): the process env on Node and Bun, and on Cloudflare
  the process env with the bindings wrangler's `getPlatformProxy` opens.
- **A remote write follows `migrate`'s rule** (ADR 0045): print the target and
  the plan, ask, `--yes` skips the question, `--dry-run` stops after the plan,
  and no terminal without `--yes` refuses.
- **A run ends like a request.** It commits and flushes the CDN purges its work
  enqueued, so a settle against production purges the pages it changed. A
  purge only a Worker can make, Workers Caching on Cloudflare, is out of reach
  from the command line, and those pages expire on their own.
- **Policy is config.** A setting a site's operator decides once, such as which
  domains may sign up, is a key in `plumix.config.ts`, versioned with the site.
- **What a request does stays.** Converting an entry's, term's or user's own
  values when it is opened is read-time behaviour, not an operator task, and is
  unchanged.

## Considered options

- **Keep the admin screens.** They put operator controls in front of editors,
  behind a capability gate, and the Field values page had to batch its work to
  stay inside one request's D1 query limit.
- **A dev-only route the CLI calls on a running `plumix dev`.** Reaches only the
  local database and needs a dev server up; it can't reach production, which is
  where a settle after an import matters.
