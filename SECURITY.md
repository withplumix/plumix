# Security policy

## Reporting a vulnerability

Report it privately through [GitHub Security Advisories](https://github.com/withplumix/plumix/security/advisories/new). Don't describe it in an issue, a discussion or any other public place until we have acknowledged it and agreed on disclosure.

Include:

- what the vulnerability is and what an attacker gains
- the affected package and version
- the steps or proof of concept that reproduce it, run by you
- any configuration it depends on

A report written with an AI tool is welcome if you reproduced it yourself. Don't request a CVE of your own. GitHub issues one through the advisory.

## What happens next

- We acknowledge a report within 3 working days. If you hear nothing by then, comment on the advisory.
- We send an initial assessment within 1 week.
- We aim to patch a critical issue within 2 weeks. Other fixes take as long as their severity allows.

A confirmed report becomes a [GitHub Security Advisory](https://github.com/withplumix/plumix/security/advisories). The patch ships as a normal release, and the advisory names the version that carries it. We publish the advisory when the fix ships, and no later than 90 days after the report.

We run no bug bounty. The advisory credits the reporter unless they ask us not to.

## Supported versions

Only the latest minor release of each published package gets security fixes. Upgrade to receive them.

## Threat model

A finding counts as a vulnerability only if it works without help from something Plumix trusts. A real bug outside this model still gets fixed, as a normal release rather than an advisory.

Plumix trusts:

- the site owner and the machines and accounts they deploy from
- `plumix.config.ts`, the environment and the secrets the owner sets
- the plugins and themes the owner installs, which run as part of the application
- the runtime and the platform services it binds to

Plumix does not trust:

- any inbound request, signed in or not
- a signed-in user beyond the capabilities their role grants
- content a user stores, which other people's browsers render later
- uploaded files, form submissions and search input

The reports we most want show a visitor or a lower-privileged user getting past authentication, sessions, the CSRF check or an access policy, reading content they shouldn't see, such as drafts or private entries, or getting script into a page someone else views.

## Scope

Every package published from this repository is in scope: `plumix`, `create-plumix-app`, and everything under `@plumix/`.

### Out of scope

None of these is a vulnerability in Plumix on its own. Each becomes one when you can show the path we missed, and that path is the report.

- **A dependency's published CVE with no reachable call path.** Report the dependency's bug upstream. The route through our code to the vulnerable function is what's worth reporting here.
- **Plugins and themes published elsewhere.** Report those to their maintainers.
- **Behaviour that only appears under `plumix dev`.** The dev server favours debugging over hardening. A dev-only endpoint you can reach in a production build is a report.
- **Admin access on `demo.plumix.dev`.** The demo gives every visitor a synthetic admin in a database of their own. That's the "try the editor" sandbox working as designed. Reaching _another_ visitor's data, or the real sign-in the demo blocks, is a report.
- **Configuration of a site we host.** `plumix.dev`, `docs.plumix.dev` and `demo.plumix.dev` are deployed from `apps/`. A missing header on one of them is ours to fix and worth telling us about, but it isn't a vulnerability in the packages. Anything you can reproduce against the packages is a report, wherever you noticed it.
- **Self-XSS**, and anything else that needs the victim to paste attacker-supplied content into their own console or editor.
- **Code the site owner chose to run.** Installing a plugin or theme runs its code by design. A path that runs code without an install is a report.
- **Scanner output with no demonstrated impact.** A finding needs the request that proves it.

## Safe harbor

We won't pursue good-faith research that stays within these bounds:

- Test against your own installation, or the demo's per-visitor sandbox.
- Don't access, change or delete anyone else's data, and don't degrade a live service.
- Stop and tell us if you reach data that isn't yours.
