# Security Policy

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, please report them via [GitHub Security Advisories](https://github.com/withplumix/plumix/security/advisories/new).

### What to include

- A description of the vulnerability
- Steps to reproduce
- Affected versions
- Any potential impact

### Response timeline

- **Acknowledgment:** within 3 working days
- **Initial assessment:** within 1 week
- **Fix timeline:** depends on severity, but we aim for patches within 2 weeks for critical issues

This project follows a **90-day disclosure timeline**.

> **Please do not report, discuss, or describe security issues in GitHub Issues, GitHub Discussions, or any other public forum without prior contact and acknowledgment from the maintainers.**

## Scope

Every package published from this repository is in scope: `plumix`, `create-plumix-app`, and everything under `@plumix/`. A rule rather than a list, so that shipping a package does not quietly put it outside the policy.

Four take untrusted input, and are the ones we most want reports about:

- **`@plumix/core`** — authentication, sessions, the CSRF gate, the access policies and the request dispatcher.
- **`@plumix/plugin-comments`** and **`@plumix/plugin-forms`** — anonymous public form submissions.
- **`@plumix/plugin-search`** — a visitor's typing reaches a full-text query.
- **`@plumix/plugin-media`** — uploads.

### Out of scope

None of these is a vulnerability in this project on its own. Each becomes one the moment you can show the path we have missed, and that path is the report.

- **A dependency's published CVE with no reachable call path.** We watch advisories. What is worth reporting is the route through our code that reaches the vulnerable function.
- **Admin access on `demo.plumix.dev`.** The demo hands every visitor a synthetic admin in a per-session database of its own. That is the "try the editor" sandbox working as designed, not a broken login. Reaching _another_ session's data, or reaching the real auth rails the demo blocks, is a report.
- **Configuration of a site we host, rather than a defect in the packages.** `plumix.dev`, `docs.plumix.dev` and `demo.plumix.dev` are deployed from `apps/`. A missing header on one of them is ours to fix and worth telling us about, but it is not a vulnerability in the software. Anything you can reproduce against the packages is a report, wherever you noticed it.
- **Self-XSS**, and anything else that requires the victim to paste attacker-supplied content into their own console or editor.
- **Code a site owner chose to run.** A plugin or theme executes as part of the application, so installing one is running its code by design. A path that reaches that execution without an install is a report.
- **Output from a scanner with no demonstrated impact.** A finding needs the request that proves it.

## What happens next

A confirmed report becomes a [GitHub Security Advisory](https://github.com/withplumix/plumix/security/advisories), which is where the fix is described. The patch ships as a normal release, so the version carrying it is the one the advisory names.

We run no bug bounty. A reporter is credited in the advisory unless they ask not to be.

## Supported Versions

| Version | Supported            |
| ------- | -------------------- |
| 0.x     | ✅ Latest minor only |

We only support the latest minor release. Upgrade to receive security fixes.
