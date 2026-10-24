# Architecture

This is the map of Plumix: what the parts are, where they live, and what must stay true between
them. It stays at the level of boxes and arrows. Each subsystem has a page in
[`docs/architecture/`](docs/architecture/) that goes one level down, and the decisions behind the
boxes are in [`docs/adr/`](docs/adr/).

## The system

A site describes its content model, plugins and theme in TypeScript. Plumix builds the admin, the
public URLs, the APIs and the capability checks from that description, and serves all of it from
one process on the runtime the site picks.

This is Plumix as designed, following [`VISION.md`](VISION.md). Words used here mean what
[`GLOSSARY.md`](GLOSSARY.md) says they mean.

The diagrams below follow the [C4 model](https://c4model.com). Context, containers and components
each zoom one level further in; the deployment diagram shows where the containers run;
the dynamic diagrams show the flows most changes touch; a data model and a state diagram
follow. They are Mermaid, so GitHub draws them
and an agent reads every element and relationship from the text. Each box names its C4 type in
brackets. One key covers them all:

| Notation                           | Meaning                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Dark blue box                      | Person                                                                                                                           |
| Bright blue box                    | The software system in scope                                                                                                     |
| Medium blue box or cylinder        | Container: something that runs, or a data store                                                                                  |
| Light blue box                     | Component inside a container                                                                                                     |
| Grey box                           | Software system outside Plumix                                                                                                   |
| White box, blue border             | Infrastructure a deployment provides, such as a cache or cron                                                                    |
| Solid arrow                        | The label gives intent, then technology in brackets where it crosses a process. Arrows inside one container are in-process calls |
| Dashed grey outline                | Grouping or system boundary                                                                                                      |
| Dashed blue outline                | Container boundary, with its components inside                                                                                   |
| Solid outline                      | Deployment node, such as a browser, a server or a platform environment                                                           |
| Data model lines                   | A line joins two tables; the end with a fork means many, a bar means exactly one, a circle means the link is optional            |
| Rounded box, arrow (state diagram) | A status, and the action that moves an entry to the next one                                                                     |
| Sequence arrows (dynamic diagrams) | A solid arrow is a call, a dashed arrow its reply, numbered in order; an `alt` box shows alternative paths                       |

Acronyms: MCP is the Model Context Protocol, RPC a remote procedure call, REST an HTTP JSON API,
OTLP the OpenTelemetry protocol, LLM a large language model, SSO single sign-on, PKCE the OAuth proof
key for code exchange, TLS transport encryption. "Opt-in" means off in production until the site's config turns
it on.

### Context

Who and what surrounds one Plumix site. It shows only what core offers: a plugin's own outside
systems, such as the crawlers that read the SEO plugin's sitemaps, belong on that plugin's page. The
people are kinds of user, not roles. A role is a set of capabilities: a member holds
the `member` role, editors and designers hold `author`, `editor`, `admin` or a role the site defines.

Some things are left off on purpose. The runtime the site runs on is a deployment choice, so it is on
the deployment diagram. Multisite: one install serves one site. A plugin marketplace: plugins ship
through npm and are installed in code. An external cache server such as Redis: the key-value slot is
where a cache would live. Backups: the runtime host or provider owns them. Dev-only tooling such as the debug
bar: these diagrams describe the production system.

```mermaid
---
title: System Context diagram for a Plumix site
---
flowchart TB
  subgraph people["People"]
    dev["<b>Developer</b><br/><i>[Person]</i><br/>Builds the site in code,<br/>deploys it, runs the CLI"]
    editor["<b>Editor</b><br/><i>[Person]</i><br/>Writes and publishes content"]
    designer["<b>Designer</b><br/><i>[Person]</i><br/>Composes pages visually"]
    admin["<b>Site admin</b><br/><i>[Person]</i><br/>Manages users and settings"]
    member["<b>Member</b><br/><i>[Person]</i><br/>Signed-in visitor"]
    visitor["<b>Visitor</b><br/><i>[Person]</i><br/>Anonymous reader"]
  end

  subgraph callers["Software that calls the site"]
    agent["<b>Agent</b><br/><i>[Software System]</i><br/>An AI client, e.g. Claude Code"]
    api["<b>API client</b><br/><i>[Software System]</i><br/>Another app reading content"]
  end

  site["<b>Plumix site</b><br/><i>[Software System]</i><br/>Content model, theme, plugins,<br/>admin and visual editor,<br/>public site, APIs"]

  subgraph used["Systems the site depends on"]
    idp["<b>Identity providers</b><br/><i>[Software System]</i><br/>OAuth (GitHub and Google built in),<br/>or a single sign-on proxy"]
    mail["<b>Mail provider</b><br/><i>[Software System]</i><br/>Whatever the mailer slot points at"]
    cdnapi["<b>CDN provider</b><br/><i>[Software System]</i><br/>Optional; caches pages,<br/>purged by tag"]
    llm["<b>LLM provider</b><br/><i>[Software System]</i><br/>Large language model behind<br/>the in-editor agent"]
    otel["<b>Telemetry sink</b><br/><i>[Software System]</i><br/>Any OpenTelemetry endpoint,<br/>behind the telemetry slot"]
    hooks["<b>Webhook receivers</b><br/><i>[Software System]</i><br/>Notified when content changes"]
  end

  dev -- "Builds, configures and deploys<br/>[code, plumix CLI]" --> site
  editor -- "Writes and publishes content<br/>[admin, in a browser]" --> site
  designer -- "Composes pages from blocks<br/>and design tokens [visual editor]" --> site
  admin -- "Manages users and settings<br/>[admin, in a browser]" --> site
  member -- "Signs in, reads members-only<br/>content [web]" --> site
  visitor -- "Reads public pages [web]" --> site
  agent -- "Reads content and the schema<br/>[MCP over HTTPS, opt-in]" --> site
  agent -- "Writes and publishes content, composes pages,<br/>within its token's capabilities [MCP]" --> site
  api -- "Reads published content<br/>[REST, JSON over HTTPS, opt-in]" --> site
  site -- "Signs people in with<br/>[OAuth 2.0, or an SSO JWT checked against JWKS]" --> idp
  site -- "Sends sign-in links and<br/>notifications [provider API or SMTP]" --> mail
  site -- "Purges cached pages by tag<br/>[HTTPS API, token]" --> cdnapi
  site -- "Asks for page drafts [provider API]" --> llm
  site -- "Exports traces [OTLP over HTTP]" --> otel
  site -- "Notifies of content changes<br/>[HTTPS POST with its headers]" --> hooks

  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef cont fill:#438dd5,stroke:#2e6295,color:#fff
  classDef comp fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef ext fill:#999999,stroke:#6b6b6b,color:#fff
  classDef infra fill:#ffffff,stroke:#438dd5,color:#1a1a1a
  class dev,editor,designer,admin,member,visitor person
  class site system
  class agent,api,idp,mail,cdnapi,llm,otel,hooks ext
  style people fill:none,stroke:#888,stroke-dasharray:4 4
  style callers fill:none,stroke:#888,stroke-dasharray:4 4
  style used fill:none,stroke:#888,stroke-dasharray:4 4
```

### Containers

The runnable parts of one site and the data stores they use. The CDN, image resizing, cron triggers
and environments vary by runtime, so they are on the deployment diagram. Scheduled tasks are fired by the platform's cron triggers, by a timer
inside the app process on Node and Bun, or by `plumix cron run`.

```mermaid
---
title: Container diagram for a Plumix site
---
flowchart LR
  subgraph who["People and software that use the site"]
    dev["<b>Developer</b><br/><i>[Person]</i>"]
    staff["<b>Editor, designer, site admin</b><br/><i>[Person]</i>"]
    reader["<b>Visitor or member</b><br/><i>[Person]</i>"]
    agent["<b>Agent</b><br/><i>[Software System]</i>"]
    api["<b>API client</b><br/><i>[Software System]</i>"]
    cron["<b>Scheduler</b><br/><i>[Infrastructure: the platform's cron, or a timer]</i>"]
  end

  subgraph sb["Plumix site [Software System]"]
    cli["<b>plumix CLI</b><br/><i>[Container: Node or Bun command-line app]</i><br/>migrate, sync, import, cron, mail, doctor, meta,<br/>i18n, dev, build; deploy, preview, types where the runtime has them<br/><code>packages/plumix/src/cli</code>"]
    adminapp["<b>Admin and visual editor</b><br/><i>[Container: React single-page app, in the browser]</i><br/>Edits content, composes pages, manages roles<br/><code>packages/admin</code>, <code>packages/admin-editor</code>"]
    public["<b>Public site</b><br/><i>[Container: HTML and island scripts, in the browser]</i><br/>What visitors and members read<br/>the site's theme and <code>packages/core/src/blocks</code>"]
    app["<b>App process</b><br/><i>[Container: TypeScript server, on the runtime the site picks]</i><br/>Routes requests, renders pages, serves RPC, REST and MCP,<br/>runs the theme, plugins and scheduled tasks<br/><code>packages/core</code>, <code>packages/runtimes/*</code>"]
    db[("<b>Database</b><br/><i>[Container: SQLite: a file, the platform's service,<br/>or a libsql server]</i><br/>Content, users, sessions, leases")]
    files[("<b>Object storage</b><br/><i>[Container: S3-compatible, or local disk]</i><br/>Uploaded files; optional storage slot")]
    kv[("<b>Key-value store</b><br/><i>[Container: the platform's store, or in memory]</i><br/>Optional slot")]
    queue[("<b>Job queue</b><br/><i>[Container: the queue slot,<br/>filled by the runtime's own queue]</i><br/>Work that outlives a request,<br/>such as webhook deliveries")]
  end

  subgraph used["Systems the site depends on"]
    idp["<b>Identity providers</b><br/><i>[Software System]</i>"]
    mail["<b>Mail provider</b><br/><i>[Software System]</i>"]
    cdnapi["<b>CDN provider</b><br/><i>[Software System]</i>"]
    llm["<b>LLM provider</b><br/><i>[Software System]</i>"]
    otel["<b>Telemetry sink</b><br/><i>[Software System]</i>"]
    hooks["<b>Webhook receivers</b><br/><i>[Software System]</i>"]
  end

  dev -- "Runs [terminal or CI]" --> cli
  cli -- "Migrates, syncs and imports [the platform's database CLI, local or remote,<br/>or the SQLite file]; runs cron tasks in its own process<br/>[a SQLite file or libsql, not a platform database]" --> db
  cli -- "Syncs with server runtimes, settles any sync,<br/>tests mail [HTTPS, API token]" ---> app
  staff -- "Edits content, composes pages [browser]" --> adminapp
  adminapp -- "Loads its shell and calls procedures<br/>[HTTPS, oRPC]" --> app
  reader -- "Reads pages [browser]" --> public
  reader -- "Signs in on the sign-in page [browser]" --> adminapp
  public -- "Requests pages, media and form posts<br/>[HTTPS]" --> app
  agent -- "Reads content and the schema<br/>[MCP over HTTPS, opt-in]" --> app
  cron -- "Fires scheduled tasks<br/>[scheduled handler, or timer]" --> app
  agent -- "Writes and publishes content, composes pages [MCP]" --> app
  api -- "Reads published content<br/>[REST, JSON over HTTPS, opt-in]" --> app
  app -- "Reads and writes<br/>[SQL via drizzle]" --> db
  app -- "Stores and reads files<br/>[S3 API or the platform's handle]" --> files
  app -- "Reads and writes<br/>[the platform's handle, or memory]" --> kv
  app -- "Signs people in<br/>[OAuth 2.0, or an SSO JWT checked against JWKS]" --> idp
  adminapp -- "Sends the person to sign in [HTTPS redirect]" --> idp
  app -- "Sends mail [provider API or SMTP]" --> mail
  app -- "Purges by tag [HTTPS API]" --> cdnapi
  app -- "Asks for page drafts [provider API]" --> llm
  app -- "Exports traces [OTLP over HTTP]" --> otel
  app -- "Notifies of content changes<br/>[HTTPS POST with its headers]" --> hooks
  app -- "Enqueues background work" --> queue
  queue -- "Delivers queued jobs to [the runtime's queue consumer]" --> app

  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef cont fill:#438dd5,stroke:#2e6295,color:#fff
  classDef comp fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef ext fill:#999999,stroke:#6b6b6b,color:#fff
  classDef infra fill:#ffffff,stroke:#438dd5,color:#1a1a1a
  class dev,staff,reader person
  class agent,api,idp,mail,cdnapi,llm,otel,hooks ext
  class cron infra
  class cli,adminapp,public,app,db,files,kv,queue cont
  style who fill:none,stroke:#888,stroke-dasharray:4 4
  style sb fill:none,stroke:#888,stroke-dasharray:4 4
  style used fill:none,stroke:#888,stroke-dasharray:4 4
```

### Components of the app process

What runs inside the app process. Core's components live in `packages/core/src`; the theme and the
plugins are the site's own code, installed into the process. Infrastructure reaches core through config
slots, which the runtime packages and core's portable providers fill; the runtime adapter itself supplies
the entry module, static assets, the client address its own CLI commands (`dev` and `build` everywhere, plus `deploy`,
`preview` and `types` where the platform has them) and its `plumix doctor` diagnostics.

```mermaid
---
title: Component diagram for the app process
---
flowchart LR
  subgraph callers["What calls the app process"]
    adminapp["<b>Admin and visual editor</b><br/><i>[Container]</i>"]
    public["<b>Public site</b><br/><i>[Container]</i>"]
    agent["<b>Agent</b><br/><i>[Software System]</i>"]
    api["<b>API client</b><br/><i>[Software System]</i>"]
    cli["<b>plumix CLI</b><br/><i>[Container]</i>"]
    cron["<b>Scheduler</b><br/><i>[Infrastructure: cron trigger or in-process timer]</i><br/>The timer and the CLI take a run guard<br/>so replicas don't double-run tasks"]
  end

  subgraph app["App process [Container]"]
    builder["<b>App builder</b><br/><i>[Component: core runtime/app.ts]</i><br/>Builds the app once: installs plugins,<br/>merges schemas, validates the config"]
    entry["<b>Runtime handler</b><br/><i>[Component: runtimes/*/entry-codegen,<br/>core runtime/handler.ts]</i><br/>Builds the request context, hands off<br/>fetch and scheduled calls; the entry module<br/>is generated into .plumix/worker.ts at build"]
    dispatcher["<b>Dispatcher</b><br/><i>[Component: core runtime/dispatcher.ts]</i><br/>Checks CSRF and origin; routes to pages, admin shell,<br/>RPC, REST, MCP, sign-in, sync and plugin routes;<br/>runs sync transfer and settle (runtime/sync-*.ts);<br/>flushes CDN purges"]
    sched["<b>Scheduled tasks</b><br/><i>[Component: core runtime/scheduled.ts]</i><br/>Runs core's and plugins' tasks,<br/>and queued jobs"]
    authc["<b>Auth and access</b><br/><i>[Component: core auth, access]</i><br/>Sign-in methods, sessions, tokens,<br/>capabilities, per-entry access policy"]
    surfaces["<b>RPC, REST and MCP</b><br/><i>[Component: core rpc, rest, mcp]</i><br/>Admin procedures with the write lifecycle,<br/>read API, agent tools"]
    cdn["<b>CDN read-through</b><br/><i>[Component: core cdn]</i><br/>Serves stored pages, stores shared ones,<br/>keys by segment, purges by tag"]
    render["<b>Routing and render</b><br/><i>[Component: core route]</i><br/>Resolves URLs, renders pages"]
    content["<b>Content services</b><br/><i>[Component: core entries, terms,<br/>users, revisions]</i><br/>Reads entries, terms and users<br/>with access applied"]
    pluginsys["<b>Plugin system and hooks</b><br/><i>[Component: core plugin, hooks]</i><br/>Holds what plugins registered,<br/>runs filters and actions"]
    mailc["<b>Mail</b><br/><i>[Component: core mail]</i><br/>Mails declared by name"]
    slots["<b>Config slots</b><br/><i>[Component: core contracts,<br/>runtime packages]</i><br/>Database, storage, key-value, CDN, mailer,<br/>image delivery, telemetry, queue, LLM"]
    theme["<b>Theme</b><br/><i>[Component: site code, React]</i><br/>Templates, blocks, design tokens"]
    policy["<b>Allowed blocks and style policy</b><br/><i>[Component: theme config, core rpc]</i><br/>Which blocks the editor offers;<br/>custom values or design tokens only"]
    roles["<b>Site-defined roles</b><br/><i>[Component: core access, users]</i><br/>Default roles plus roles a site<br/>declares from capabilities"]
    webhooks["<b>Webhooks</b><br/><i>[Component: core]</i><br/>POSTs a declared payload<br/>on content actions"]
    assistant["<b>In-editor agent</b><br/><i>[Component: core rpc, the llm slot]</i><br/>Drafts and composes pages<br/>for the editor who asks"]
    plugins["<b>Plugins</b><br/><i>[Component: site code, definePlugin]</i><br/>Blocks, fields, routes, procedures, tools"]
  end

  subgraph stores["Data stores and outside systems"]
    db[("<b>Database</b><br/><i>[Container]</i>")]
    files[("<b>Object storage</b><br/><i>[Container]</i>")]
    kv[("<b>Key-value store</b><br/><i>[Container]</i>")]
    idp["<b>Identity providers</b><br/><i>[Software System]</i>"]
    mail["<b>Mail provider</b><br/><i>[Software System]</i>"]
    cdnapi["<b>CDN provider</b><br/><i>[Software System]</i>"]
    receivers["<b>Webhook receivers</b><br/><i>[Software System]</i>"]
    otelsink["<b>Telemetry sink</b><br/><i>[Software System]</i>"]
    llmsys["<b>LLM provider</b><br/><i>[Software System]</i>"]
    queuec[("<b>Job queue</b><br/><i>[Container]</i>")]
  end

  adminapp -- "Calls procedures [oRPC over HTTPS]" --> entry
  public -- "Requests pages [HTTPS]" --> entry
  agent -- "Reads content and the schema [MCP over HTTPS]" --> entry
  agent -- "Writes and publishes content, composes pages [MCP over HTTPS]" --> entry
  api -- "Reads content [REST over HTTPS]" --> entry
  cli -- "Syncs with server runtimes, settles any sync, tests mail [HTTPS, API token]" --> entry
  cron -- "Fires scheduled tasks [scheduled handler or timer]" --> entry
  entry -- "Builds the app once, then reuses it" --> builder
  builder -- "Installs plugins through" --> pluginsys
  builder -- "Fires theme:ready for" --> theme
  entry -- "Hands requests to" --> dispatcher
  entry -- "Hands scheduled calls to" --> sched
  dispatcher -- "Routes sign-in, loads the user, gates by<br/>access policy, picks the cache segment" --> authc
  dispatcher -- "Matches the URL to a route" --> render
  dispatcher -- "Hands API calls to" --> surfaces
  dispatcher -- "Hands page renders to, defers purges" --> cdn
  dispatcher -- "Runs plugin routes from" --> pluginsys
  cdn -- "Renders on a miss" --> render
  cdn -- "Stores and purges through" --> slots
  surfaces -- "Authenticates, checks capabilities" --> authc
  surfaces -- "Reads through, checks the user may edit the entry" --> content
  surfaces -- "Writes through [guarded UPDATE]" --> slots
  surfaces -- "Runs filters, actions and registered<br/>procedures, resources and tools from" --> pluginsys
  surfaces -- "Sends mail through" --> mailc
  render -- "Reads entries through" --> content
  render -- "Uses registered routes and blocks from" --> pluginsys
  render -- "Renders through" --> theme
  sched -- "Runs registered tasks from" --> pluginsys
  authc -- "Sends sign-in links through" --> mailc
  authc -- "Signs people in [OAuth 2.0]" --> idp
  content -- "Reads through" --> slots
  pluginsys -- "Installs and calls" --> plugins
  pluginsys -- "Queues purge tags from entry actions" --> cdn
  authc -- "Stores OAuth state and sessions<br/>[SQL via drizzle]" --> slots
  sched -- "Publishes due entries, prunes sessions<br/>[SQL via drizzle]" --> slots
  sched -- "Fires the entry actions of scheduled publishing" --> pluginsys
  sched -- "Flushes purges after a run" --> cdn
  mailc -- "Delivers through" --> slots
  slots -- "Reads and writes [SQL via drizzle]" --> db
  slots -- "Stores files [S3 API, the platform's handle or file system]" --> files
  slots -- "Reads and writes [the platform's handle, or memory]" --> kv
  slots -- "Sends mail [provider API or SMTP]" --> mail
  slots -- "Purges by tag [HTTPS API]" --> cdnapi

  pluginsys -- "Hands content actions to" --> webhooks
  webhooks -- "Enqueues each delivery through" --> slots
  slots -- "Enqueues [the queue slot]" --> queuec
  queuec -- "Delivers queued jobs [the runtime's queue consumer]" --> entry
  entry -- "Hands queued jobs to" --> sched
  sched -- "Runs webhook deliveries through" --> webhooks
  webhooks -- "Delivers [HTTPS POST with its headers]" --> receivers
  slots -- "Exports traces [the published OTLP consumer]" --> otelsink
  assistant -- "Asks for drafts [the llm slot]" --> slots
  slots -- "Calls the model [provider API]" --> llmsys
  theme -- "Declares allowedBlocks<br/>and style policy" --> policy
  policy -- "Reaches the editor in the plugin manifest,<br/>built by the Vite plugin" --> adminapp
  surfaces -- "Hold agents' writes to the same<br/>policy, leases and capabilities" --> policy
  authc -- "Resolves roles from the database and config" --> roles
  roles -- "Stored through [SQL via drizzle]" --> slots
  surfaces -- "Hand page-draft requests to" --> assistant
  assistant -- "Draft through the same<br/>procedures as an editor" --> surfaces

  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef cont fill:#438dd5,stroke:#2e6295,color:#fff
  classDef comp fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef ext fill:#999999,stroke:#6b6b6b,color:#fff
  classDef infra fill:#ffffff,stroke:#438dd5,color:#1a1a1a
  class adminapp,public,cli,db,files,kv,queuec cont
  class agent,api,idp,mail,cdnapi,receivers,otelsink,llmsys ext
  class cron infra
  class builder,entry,dispatcher,sched,authc,surfaces,cdn,render,content,pluginsys,mailc,slots,theme,plugins,policy,roles,webhooks,assistant comp
  style callers fill:none,stroke:#888,stroke-dasharray:4 4
  style app fill:none,stroke:#438dd5,stroke-dasharray:4 4
  style stores fill:none,stroke:#888,stroke-dasharray:4 4
```

Where to start, for each component and the containers around it:

| Component               | Code                                                                                                                                        | Read first                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Runtime handler         | `packages/runtimes/*/src/entry-codegen.ts` (generates `.plumix/worker.ts`), `packages/core/src/runtime/handler.ts` (`createRuntimeHandler`) | [runtimes](docs/architecture/runtimes.md)                                                                                       |
| Dispatcher              | `packages/core/src/runtime/dispatcher.ts` (`createPlumixDispatcher`), `sync-transfer.ts`, `sync-settle.ts`                                  | [routing and render](docs/architecture/routing-and-render.md)                                                                   |
| Scheduled tasks         | `packages/core/src/runtime/scheduled.ts` (`runScheduledTasks`); the run guard is `scheduled-guard.ts`                                       | [cron](docs/architecture/cron.md)                                                                                               |
| Auth and access         | `packages/core/src/auth`, `access`                                                                                                          | [auth and access](docs/architecture/auth-and-access.md)                                                                         |
| RPC, REST and MCP       | `packages/core/src/rpc` (writes: `rpc/procedures/entry/update.ts`, `lifecycle.ts`), `rest`, `mcp`                                           | [RPC and editing](docs/architecture/rpc-and-editing.md), [REST](docs/architecture/rest-api.md), [MCP](docs/architecture/mcp.md) |
| CDN read-through        | `packages/core/src/cdn`                                                                                                                     | [CDN cache](docs/architecture/cdn-cache.md)                                                                                     |
| Routing and render      | `packages/core/src/route`                                                                                                                   | [routing and render](docs/architecture/routing-and-render.md)                                                                   |
| Content services        | `packages/core/src/entries`, `terms`, `users`, `revisions` (reads)                                                                          | [RPC and editing](docs/architecture/rpc-and-editing.md)                                                                         |
| Plugin system and hooks | `packages/core/src/plugin`, `hooks`                                                                                                         | [plugin system](docs/architecture/plugin-system.md), [hooks](docs/architecture/hooks.md)                                        |
| Mail                    | `packages/core/src/mail`                                                                                                                    | [mail](docs/architecture/mail.md)                                                                                               |
| Config slots            | `packages/core/src/runtime/contract/slots.ts`, `auth/contract/mailer.ts`, `context/telemetry.ts`, `packages/runtimes/*`                     | [runtimes](docs/architecture/runtimes.md), [media and storage](docs/architecture/media-and-storage.md)                          |
| Theme                   | the site's theme, `packages/core/src/blocks`                                                                                                | [blocks and islands](docs/architecture/blocks-and-islands.md)                                                                   |
| Plugins                 | `packages/plugins/*`                                                                                                                        | [plugin system](docs/architecture/plugin-system.md)                                                                             |
| Admin and visual editor | `packages/admin`, `admin-editor`, `admin-ui`                                                                                                | [admin and editor](docs/architecture/admin-and-editor.md)                                                                       |
| plumix CLI and build    | `packages/plumix/src/cli`, `vite`                                                                                                           | [build and CLI](docs/architecture/build-and-cli.md), [sync and import](docs/architecture/sync-and-import.md)                    |

### Deployment

Where the containers run. Every runtime deploys the same shape, so one diagram covers them all: each
box names the kind of thing it is, and the table below names what fills it on each runtime.

Runtimes come in two shapes. A managed platform provides TLS, static assets, image
resizing, cron and an origin cache in front of the app, and runs one copy of this diagram per
environment. A server runtime (Node and Bun) runs behind a reverse proxy that terminates TLS, and
serves static assets, resizes images and fires scheduled tasks inside its own process. Either can sit
behind a CDN, which caches pages by its own rules; the app decorates each shareable page with cache
headers and tags and purges by tag. The CDN provider on the context diagram is that CDN here.

```mermaid
---
title: Deployment diagram for a Plumix site, on any runtime
---
flowchart TB
  subgraph browser["Browser [Deployment Node: web browser]"]
    public["<b>Public site</b><br/><i>[Container: HTML and island scripts]</i>"]
    adminapp["<b>Admin and visual editor</b><br/><i>[Container: React single-page app]</i>"]
  end

  subgraph devbox["Developer machine, CI or the server [Deployment Node: Node or Bun]"]
    cli["<b>plumix CLI</b><br/><i>[Container: Node or Bun command-line app]</i>"]
  end

  subgraph env["Runtime environment [Deployment Node: a managed platform's environment, or a server]"]
    front["<b>Front</b><br/><i>[Infrastructure: the platform's edge, or a reverse proxy<br/>such as Caddy or nginx; optionally a CDN in front]</i><br/>Terminates TLS, may serve cached pages"]
    sched["<b>Scheduler</b><br/><i>[Infrastructure: the platform's cron triggers,<br/>or a timer in the process]</i>"]
    app["<b>App process</b><br/><i>[Container: the site's server bundle]</i>"]
    assets["<b>Static assets</b><br/><i>[Infrastructure: the platform's asset service,<br/>or a layer of the app's listener]</i>"]
    images["<b>Image resizing</b><br/><i>[Infrastructure: the platform's image service,<br/>or a layer of the app's listener]</i>"]
    cache["<b>Origin cache</b><br/><i>[Infrastructure: the platform's cache,<br/>where it has one]</i>"]
    db[("<b>Database</b><br/><i>[Container: SQLite, a file<br/>or the platform's service]</i>")]
    files[("<b>Object storage</b><br/><i>[Container: S3-compatible, or local disk]</i>")]
    kv[("<b>Key-value store</b><br/><i>[Container: the platform's store, or memory<br/>inside the app process]</i>")]
    queued[("<b>Job queue</b><br/><i>[Container: the runtime's own queue]</i>")]
  end

  subgraph outside["Outside the runtime environment"]
    remotedb[("<b>Database, on a remote libsql host</b><br/><i>[Container: libsql, instead of a local file]</i>")]
    providers["<b>Identity and mail providers</b><br/><i>[Software Systems]</i>"]
    outsvc["<b>Telemetry sink, webhook receivers,<br/>LLM provider</b><br/><i>[Software Systems]</i>"]
  end

  public -- "Requests pages, assets, images [HTTPS]" --> front
  adminapp -- "Loads the bundle, calls procedures [HTTPS, oRPC]" --> front
  front -- "Serves, on a platform" --> assets
  front -- "Serves, on a platform" --> images
  front -- "Forwards [platform runtime, or HTTP]" --> app
  app -- "Serves, on a server" ---> assets
  app -- "Resizes, on a server" ---> images
  images -- "Fetches originals [HTTPS or file system]" --> files
  sched -- "Fires scheduled tasks<br/>[scheduled handler, or timer]" --> app
  app -- "Reads through, stores pages [cache API]" --> cache
  app -- "Reads and writes [the platform's handle, or SQL]" --> db
  app -- "Enqueues and runs work" --> queued
  app -- "Reads and writes when configured<br/>[libsql over HTTPS]" --> remotedb
  app -- "Stores files [the platform's handle, S3 API or file system]" --> files
  app -- "Reads and writes [the platform's handle, or memory]" --> kv
  app -- "Purges cached pages by tag [the CDN's purge API]" --> front
  app -- "Signs people in, sends mail<br/>[OAuth 2.0, provider API or SMTP]" --> providers
  app -- "Exports traces, notifies webhook receivers,<br/>asks the LLM [OTLP, HTTPS, provider API]" --> outsvc
  cli -- "Deploys<br/>[the platform's deploy, or the operator copies the build]" --> env
  cli -- "Migrates, exports and imports<br/>[the platform's database CLI, or the SQLite file]" --> db
  cli -- "Exports and imports media<br/>[the platform's storage, or local disk]" --> files
  cli -- "Syncs with server runtimes, settles any sync,<br/>tests mail [HTTPS through the front, API token]" ---> app

  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef cont fill:#438dd5,stroke:#2e6295,color:#fff
  classDef comp fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef ext fill:#999999,stroke:#6b6b6b,color:#fff
  classDef infra fill:#ffffff,stroke:#438dd5,color:#1a1a1a
  class cli,public,adminapp,app,db,files,kv,remotedb,queued cont
  class front,assets,images,sched,cache infra
  class providers,outsvc ext
  style browser fill:none,stroke:#666
  style devbox fill:none,stroke:#666
  style env fill:none,stroke:#666
  style outside fill:none,stroke:#888,stroke-dasharray:4 4
```

| Part           | Cloudflare                                                                                                                                       | Node                                                                             | Bun                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Server         | Worker module with `fetch` and `scheduled`                                                                                                       | `node:http`, behind a reverse proxy                                              | `Bun.serve`, behind a reverse proxy                     |
| Database       | `d1()`                                                                                                                                           | `nodeSqlite()`                                                                   | `bunSqlite()`                                           |
| Object storage | `r2()`                                                                                                                                           | `diskStorage()`                                                                  | `diskStorage()` or `bunS3()`                            |
| Key-value      | `kv()`                                                                                                                                           | `memoryKv()` from `plumix/runtime`, optional                                     | `memoryKv()` from `plumix/runtime`, optional            |
| Page cache     | Workers Caching in front, purged with `cache.purge`; the Workers Cache API read-through. Use `@plumix/runtime-cloudflare/cdn`, which purges both | a CDN zone in front, purged via `plumix/cdn/cloudflare`                          | a CDN zone in front, purged via `plumix/cdn/cloudflare` |
| Image resizing | `images()`: Image Transformations                                                                                                                | `images()`: `sharp`, an optional peer                                            | `images()`: `Bun.Image`                                 |
| Static assets  | `ASSETS` binding, served before the Worker                                                                                                       | a layer in the listener                                                          | a layer in the listener                                 |
| Scheduler      | `triggers.crons` in the wrangler config                                                                                                          | in-process timer, or `cron: false` and `plumix cron run`                         | in-process timer                                        |
| Migrations     | `plumix deploy` migrates first                                                                                                                   | a SQLite file is migrated before the server listens; libsql uses its own tooling | the same as Node                                        |
| Deploy         | `plumix deploy` (wrangler)                                                                                                                       | copy the build                                                                   | copy the build                                          |

Every runtime can also use the portable providers: `plumix/db/libsql` for the database and
`plumix/storage/s3` for object storage. The full matrix is in [runtimes](docs/architecture/runtimes.md).

### Behaviour

The flows most changes touch. Each step names the component that owns it. In the sign-in
flow, the very first user of a site is created by a passkey by default; OAuth creates the first admin
only with `bootstrapVia: "first-method-wins"`.

```mermaid
---
title: Dynamic diagram - a visitor requests a public page
---
sequenceDiagram
  autonumber
  participant V as Public site
  participant E as Runtime handler
  participant D as Dispatcher
  participant A as Auth and access
  participant C as CDN read-through
  participant R as Routing and render
  participant S as Content services
  participant T as Theme
  V->>E: GET /blog/hello [HTTPS]
  E->>D: Request with its context
  D->>D: Strips the base path, skips MCP, sync, REST, RPC, sign-in, admin and plugin routes
  D->>R: Matches the URL to a route
  D->>A: Loads the user only if the request carries a session (cookie or SSO header)
  D->>A: Gates by the entry's access policy and picks the cache segment
  alt the cdn slot is set
    D->>C: Reads through for this URL and segment
    alt the runtime has an origin cache, and a shared copy is stored
      C-->>D: Stored page
    else a miss, or no origin cache
      C->>R: Renders
      R->>S: Resolves the entry under its access policy
      R->>T: Renders the template, its blocks and their loaders
      T-->>R: HTML
      R-->>C: Response, marked personal if it read the user
      C->>C: Decorates a shareable 200 with cache headers and tags, and stores it where there is an origin cache
      C-->>D: Page
    end
  else no cdn slot, the default
    D->>R: Renders directly
    R->>S: Resolves the entry under its access policy
    R->>T: Renders the template, its blocks and their loaders
    T-->>R: HTML
    R-->>D: Page
  end
  D-->>V: Page
```

```mermaid
---
title: Dynamic diagram - an editor saves an entry
---
sequenceDiagram
  autonumber
  participant E as Admin and visual editor
  participant RE as Runtime handler
  participant D as Dispatcher
  participant P as RPC, REST and MCP (entry.update)
  participant A as Auth and access
  participant S as Content services
  participant H as Plugin system and hooks
  participant SL as Config slots (database)
  participant C as CDN read-through
  Note over E: Holds the entry's lease while it is open, renewing it every 30 s (entry.lease.*)
  E->>RE: entry.update with ifMatch set to the etag it loaded [oRPC over HTTPS]
  RE->>D: Request with its context
  D->>D: Checks the X-Plumix-Request header and origin
  D->>P: Hands the call to the procedure
  P->>A: Authenticates the session
  P->>H: Runs the rpc:entry.update:input filter
  P->>S: Checks the user may edit this entry
  P->>P: Checks no one else holds a live lease, unless the caller takes it over,<br/>then that its etag is current
  alt someone else holds a live lease, and the caller does not take over
    P-->>D: LOCKED
    D-->>E: LOCKED
  else the etag is stale
    P-->>D: CONFLICT, with the current etag and any lease holder
    D-->>E: CONFLICT
  else the type autosaves and the entry is published
    P->>SL: Writes the editor's draft, not the published entry
    P->>H: Fires the autosave_saved action
    P-->>D: Saved as a draft, with the etag unchanged
    D-->>E: Saved
  else allowed and current
    P->>P: Checks every new block and style value against the allowed blocks and style policy
    P->>H: Runs the before_save filters
    P->>SL: UPDATE where updated_at matches the etag
    alt zero rows, another save won the race
      P-->>D: CONFLICT
      D-->>E: CONFLICT
    else one row
      P->>H: Fires the updated actions and queues purge tags
      P-->>D: Saved, with the new etag
      D->>C: Hands the queued tags to a deferred purge
      D-->>E: Saved
    end
  end
```

```mermaid
---
title: Dynamic diagram - a person signs in with OAuth
---
sequenceDiagram
  autonumber
  participant B as Admin and visual editor (sign-in page)
  participant RE as Runtime handler
  participant D as Dispatcher
  participant M as Auth and access (OAuth method)
  participant K as Auth and access (kernel)
  participant O as Identity providers
  participant DB as Config slots (database)
  B->>RE: GET /_plumix/auth/oauth/github/start
  RE->>D: Request with its context
  D->>M: Routes to the declared method
  M->>DB: Stores a single-use state, hashed, with the PKCE verifier
  M-->>D: Redirect to the provider with the state and PKCE challenge
  D-->>B: The redirect
  B->>O: Signs in and consents
  O-->>B: Redirect back with a code and the state
  B->>RE: GET the callback
  RE->>D: Request with its context
  D->>M: Routes the callback
  M->>DB: Consumes the state, so it can't be replayed
  M->>O: Exchanges the code and verifier for the email and whether it is verified [OAuth 2.0]
  M->>K: proveIdentity with the provider account and email
  K->>K: Finds the linked account, else matches by email and refuses an unverified one
  K->>DB: Loads the user, or provisions one if signup allows it
  K->>DB: Mints a session and stores its hash
  K-->>D: Set-Cookie plumix_session, then a redirect
  D-->>B: The cookie and the redirect
```

How a site starts. The runtime handler builds the app once per process or instance, before the first
request is served.

```mermaid
---
title: Dynamic diagram - the app boots and installs its plugins
---
sequenceDiagram
  autonumber
  participant E as Runtime handler
  participant B as App builder
  participant PS as Plugin system and hooks
  participant P as Plugins
  participant T as Theme
  E->>B: Builds the app from plumix.config.ts, once per process or instance
  B->>PS: Creates the hook registry and registers core's own handlers
  B->>PS: Seeds core's lookups, template deps, settings and scheduled tasks
  B->>PS: installPlugins, checking every plugin id
  PS->>P: Runs every state factory
  PS->>P: Runs every provides, so helpers reach every plugin
  PS->>P: Runs every setup
  PS->>P: Runs every afterSetup, which sees the registry read-only
  B->>T: Fires theme:ready
  B->>B: Indexes image roles and merges plugin schemas
  B->>B: Validates the theme, RPC namespaces, REST routes, block variations,<br/>auth methods, mails and every scheduled task's cron
  B-->>E: The app, or the boot error
  Note over E,B: The entry awaits the app on each request, so a boot error<br/>fails every request until it is fixed
```

How agents write, and how content changes reach other systems.

```mermaid
---
title: Dynamic diagram - an agent publishes a page
---
sequenceDiagram
  autonumber
  participant G as Agent
  participant RE as Runtime handler
  participant D as Dispatcher
  participant P as RPC, REST and MCP (MCP write tool)
  participant A as Auth and access
  participant S as Content services
  participant PO as Allowed blocks and style policy
  participant H as Plugin system and hooks
  participant SL as Config slots (database)
  G->>RE: Calls a write tool with its token [MCP over HTTPS]
  RE->>D: Request with its context
  D->>P: Hands the call to the MCP surface
  P->>A: Authenticates the token, checks its capabilities
  P->>S: Checks the agent may edit this entry
  P->>P: Checks no one else holds a live lease, then that its etag is current
  alt someone else holds a live lease, which an agent never takes over
    P-->>G: LOCKED
  else the etag is stale
    P-->>G: CONFLICT, with the current concurrency token
  else allowed and current
    P->>PO: Checks every new block and style value against the policy
    P->>H: Runs the before_save filters
    P->>SL: Writes through the same procedure as the admin, capturing a revision
    alt zero rows, another save won the race
      P-->>G: CONFLICT
    else one row
      P->>H: Fires the updated and published actions, queues purge tags
      P-->>G: The saved entry, with its new etag
    end
  end
```

```mermaid
---
title: Dynamic diagram - publishing an entry fires its webhooks
---
sequenceDiagram
  autonumber
  participant P as RPC, REST and MCP
  participant H as Plugin system and hooks
  participant W as Webhooks
  participant SL as Config slots (queue)
  participant Q as Job queue
  participant RE as Runtime handler
  participant ST as Scheduled tasks
  participant R as Webhook receivers
  P->>H: Fires the published action
  H->>W: Hands the action to the entry type's webhooks
  W->>SL: Enqueues one delivery per matching webhook
  SL->>Q: Stores the jobs [the runtime's queue]
  Q->>RE: Delivers each job [the runtime's queue consumer]
  RE->>ST: Hands the queued job to
  ST->>W: Runs the delivery
  W->>R: POSTs the payload with the webhook's headers [HTTPS]
  R-->>W: Status
  W-->>ST: Done, or failed
  ST-->>RE: The result
  RE-->>Q: Acknowledges, or leaves the job to the runtime's retry
```

### Content model

What core stores. Revisions and autosaves are rows of `entries` with reserved types (`revision`,
`autosave`). Fields and meta live in a JSON `meta` column on entries, terms and users. An edit lease points at an entry, term, user or settings group by kind and id, so it has no foreign
key to them. Each plugin
that owns tables ships them with its own migration history
([ADR 0027](docs/adr/0027-each-table-owner-ships-its-own-migration-history.md)), so they are not
drawn here.

```mermaid
---
title: Content model of core, packages/core/src/db/schema
---
erDiagram
  users ||--o{ entries : "authors"
  entries |o--o{ entries : "parent of"
  entries ||--o{ entry_term : "tagged with"
  terms ||--o{ entry_term : "applied to"
  terms |o--o{ terms : "parent of"
  users ||--o{ sessions : "signed in as"
  users ||--o{ oauth_accounts : "linked to"
  users ||--o{ credentials : "has passkeys"
  users ||--o{ api_tokens : "owns"
  users |o--o{ auth_tokens : "one-time tokens: invites, verification, OAuth state"
  users |o--o{ device_codes : "approves"
  users ||--o{ edit_leases : "holds"
  users {
    int id
    text email
    text role
    json meta
    int updated_at "the concurrency token"
  }
  entries {
    int id
    text type "includes revision and autosave"
    text slug
    text status "draft, scheduled, published, trash"
    int author_id
    int parent_id
    json content "blocks"
    json meta
    int updated_at "the concurrency token"
  }
  terms {
    int id
    text taxonomy
    text slug
    int parent_id
    json meta
    int version "the concurrency token"
  }
  edit_leases {
    text resource_kind "entry, term, user or settings group"
    text resource_id
    int user_id
    text surface "admin, rpc, mcp or rest"
    int since
    int expires_at "live while in the future"
  }
  settings {
    text group
    text key
    json value
  }
  entry_changes {
    int id
    int entry_id "no foreign key"
    text kind "written by triggers"
  }
  scheduled_task_claims {
    text schedule
    int last_minute "one run per minute"
  }
  roles {
    text name "default and site-defined roles"
    json capabilities
  }
  roles |o--o{ users : "granted to"
  scheduled_task_leases {
    text key
    text token
    int expires_at
  }
```

### Entry lifecycle

The statuses an entry moves through. `entry.update` accepts any status, so every move between draft,
scheduled and published is one save. Each move fires actions, type-scoped first
(`entry:<type>:<action>`) and then generic: a save that changes a column fires `updated`, a status change also
fires `transition`, and reaching published fires `published`; a save that only changes meta fires
`entry:meta_changed`. Trash, restore and permanent
delete fire `trashed`, `restored` and `deleted`. The scheduled task publishes due entries every five
minutes.

On a type that autosaves, saving a published entry does not touch it: the editor's changes go to their
own autosave row and fire `autosave_saved`, until publishing promotes them (`updated`) or the editor
discards them (`autosave_discarded`).

```mermaid
---
title: State diagram - an entry's status
---
stateDiagram-v2
  [*] --> draft: create
  [*] --> published: create published
  [*] --> scheduled: create with a future date
  draft --> published: publish
  draft --> scheduled: publish with a future date
  scheduled --> published: scheduled task
  scheduled --> draft: save as draft
  published --> draft: save as draft
  published --> scheduled: save with a future date
  draft --> trash: trash
  scheduled --> trash: trash
  published --> trash: trash
  trash --> draft: restore
  trash --> [*]: delete permanently
```

## Quality goals

What Plumix optimizes for. When two pull apart, [`VISION.md`](VISION.md#how-plumix-decides) ranks
them. Each is held by a decision and a test, so a change that weakens one fails a check.

| Goal                                                               | Held by                                                                                                                                                                                  | Checked by                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Nobody sees what they may not, and a personal page is never shared | [ADR 0030](docs/adr/0030-a-render-that-reads-the-principal-is-never-shared.md), [ADR 0037](docs/adr/0037-a-public-surface-asks-per-entry-not-per-type.md)                                | `packages/core/src/route/render/personal-render.test.ts`, `packages/core/src/access/gate.integration.test.tsx` |
| No edit is lost or silently overwritten                            | [ADR 0048](docs/adr/0048-core-guards-every-edit-with-a-required-token-and-an-enforced-lease.md)                                                                                          | `packages/core/src/rpc/procedures/entry/concurrency.test.ts`, `lease.test.ts`                                  |
| No content is lost on upgrade                                      | [ADR 0027](docs/adr/0027-each-table-owner-ships-its-own-migration-history.md), [ADR 0044](docs/adr/0044-data-migrations-run-in-typescript-after-every-schema-migration.md)               | `pnpm migrations:check`                                                                                        |
| The developer's code is the contract, and a mistake fails early    | [ADR 0052](docs/adr/0052-a-plugin-extends-core-through-declared-events-filters-and-registrations.md), [ADR 0013](docs/adr/0013-a-published-type-is-true-at-every-boundary-it-crosses.md) | `pnpm typecheck`, `pnpm surface:check`, `packages/core/src/runtime/app-*-validation.test.ts`                   |
| The same behaviour on every runtime                                | [ADR 0019](docs/adr/0019-a-runtime-adapter-uses-its-runtimes-primitives-and-is-tested-on-that-runtime.md)                                                                                | the conformance suites in `plumix/test/conformance`                                                            |
| The anonymous request path only gets cheaper                       | `CODING_STANDARDS.md`, Performance                                                                                                                                                       | `packages/core/src/runtime/cold-path.test.ts`                                                                  |

## Trust boundaries

What Plumix trusts and where each untrusted input is checked. The full threat model is in
[`SECURITY.md`](SECURITY.md).

| Boundary                                                       | Check                                                                                          | Where                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A browser request to the admin, RPC, sign-in and plugin routes | The `X-Plumix-Request` header and the origin; MCP, REST and sync take an API token instead     | `enforcePlumixCsrf` in `runtime/dispatcher.ts`                                                  |
| Who is calling                                                 | The authenticator chain: session cookie, then API token, or a site's own                       | `defaultAuthenticator` in `auth/authenticator.ts`                                               |
| What a token may do                                            | Its scopes, intersected with its owner's capabilities                                          | `tokenScopesOf`, `makeAuthCan`                                                                  |
| An admin action                                                | The capability, then whether the user may edit the entry, then the lease and concurrency token | `requireCapability`, `assertCanEditEntry`, `assertLeaseAllows`                                  |
| A public page                                                  | The entry's access policy, and a personal render never cached shared                           | `policyForMatch`, `resolveAccess`, `trackPrincipalReads`                                        |
| A credential being created                                     | Only a signed-in session may create one, never a token                                         | `authenticateSession`, [ADR 0024](docs/adr/0024-a-credential-is-created-only-from-a-session.md) |
| Stored content rendered later                                  | Escaped on output; style values sanitized                                                      | the renderer, `blocks/styles/sanitize-css.ts`                                                   |

Trusted, and so not checked: the site owner, `plumix.config.ts` and its secrets, the installed
plugins and theme (they run as part of the app), and the runtime and its bound services.

## Failure modes

What happens when things go wrong, and who handles it.

| When                                 | What happens                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Two people edit the same entry       | The second gets `LOCKED` while the first holds a live lease, unless they choose to take it over   |
| A save is made from a stale copy     | `CONFLICT`, carrying the current concurrency token                                                |
| Two saves race                       | The guarded `UPDATE` matches no row for the loser, which gets `CONFLICT`                          |
| An action handler throws             | The others still run; it is logged to `ctx.logger` and fails its own `hook:` span, never raised   |
| A filter handler throws              | The request fails, except for isolated array filters, which skip that handler                     |
| A CDN purge fails                    | It is logged; the write it followed still succeeds                                                |
| A scheduled task fails               | Its siblings still run; the run reports `failed`                                                  |
| Two replicas fire the same task      | The run guard lets one run (the in-process timer and `plumix cron run`)                           |
| A plugin registers something twice   | Boot fails with `DuplicateRegistrationError`                                                      |
| The config or a task's cron is wrong | Boot fails; the deploy still goes out, and every request returns the boot error until it is fixed |
| No mailer is configured              | Sending throws `MailerNotConfigured`; surfaces that need mail say so                              |

## Agents

Agents are users of Plumix twice over: they build sites, and they work inside running ones.

- **Building with Plumix.** An agent starts at `AGENTS.md`, then `VISION.md` for what to build toward,
  this file for how the system fits, and the subsystem page for the area it changes. `GLOSSARY.md`
  fixes the vocabulary.
- **Inside a running site.** An agent connects to `/_plumix/mcp` with an API token. It reads content
  and the content model through core's tools and any tools plugins register with `ctx.registerMcpTool`.
  The token's scopes limit what it can do, and in production MCP is off until the config turns it on.
  It writes, composes and publishes through the same procedures as the admin, held to the same
  rules: its token's capabilities, leases, revisions, the allowed blocks and the style policy. What it
  may do is what its token may do; a person steers it by choosing that token. Every change it makes
  is a revision naming the agent and the person whose token it used.

## How do I

Where to start for common changes. Each row names the entry point and the page to read first.

| To                        | Start at                                                                                                            | Read                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Add a block               | `ctx.registerBlock` in a plugin, or the theme's `blocks`                                                            | [blocks and islands](docs/architecture/blocks-and-islands.md) |
| Add a field type          | `ctx.registerFieldType`                                                                                             | [plugin system](docs/architecture/plugin-system.md)           |
| Add a hook core fires     | the module that declares the hook name (for example `packages/core/src/rpc/hooks.ts`), and the caller that fires it | [hooks](docs/architecture/hooks.md)                           |
| Add an admin procedure    | `packages/core/src/rpc/procedures/`, or `ctx.registerRpcRouter` in a plugin                                         | [RPC and editing](docs/architecture/rpc-and-editing.md)       |
| Add a REST resource       | `ctx.registerRestResource`                                                                                          | [REST](docs/architecture/rest-api.md)                         |
| Add an agent tool         | `ctx.registerMcpTool`                                                                                               | [MCP](docs/architecture/mcp.md)                               |
| Add a scheduled task      | `ctx.registerScheduledTask`                                                                                         | [cron](docs/architecture/cron.md)                             |
| Add an admin page         | `ctx.registerAdminPage`                                                                                             | [admin and editor](docs/architecture/admin-and-editor.md)     |
| Add a table or change one | the owner's drizzle schema, then `db:generate`                                                                      | [migrations](docs/architecture/migrations.md)                 |
| Support a new runtime     | `RuntimeAdapter`, the config slots, and the conformance suites                                                      | [runtimes](docs/architecture/runtimes.md)                     |

## Subsystems

| Area       | Page                                                          | One line                                                                |
| ---------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Extending  | [Plugin system](docs/architecture/plugin-system.md)           | A descriptor declares everything a plugin contributes.                  |
|            | [Hooks](docs/architecture/hooks.md)                           | Typed filters and actions core fires at fixed points.                   |
| Serving    | [Routing and render](docs/architecture/routing-and-render.md) | A public URL resolves to data, then renders through the theme.          |
|            | [Blocks and islands](docs/architecture/blocks-and-islands.md) | Content is blocks; client JavaScript is an island a block asks for.     |
|            | [CDN cache](docs/architecture/cdn-cache.md)                   | Anonymous renders are cached and purged by tag.                         |
| Editing    | [RPC and editing](docs/architecture/rpc-and-editing.md)       | Every admin write is an RPC procedure, guarded by token and lease.      |
|            | [Admin and editor](docs/architecture/admin-and-editor.md)     | A prebuilt SPA, extended only through registrations.                    |
| Interfaces | [REST API](docs/architecture/rest-api.md)                     | Opt-in, read-only core resources, plus plugin resources.                |
|            | [MCP](docs/architecture/mcp.md)                               | Agent tools that read and write. On in dev, opt-in in production.       |
| People     | [Auth and access](docs/architecture/auth-and-access.md)       | Sign-in methods, sessions, roles, capabilities, per-entry access.       |
|            | [Mail](docs/architecture/mail.md)                             | Mails declared by name and sent through a mailer slot.                  |
| Platform   | [Runtimes](docs/architecture/runtimes.md)                     | One adapter per runtime, held to a shared conformance suite.            |
|            | [Migrations](docs/architecture/migrations.md)                 | Each table owner ships its history; data migrations run after schema.   |
|            | [Sync and import](docs/architecture/sync-and-import.md)       | Moving content between installs; a sync replaces a scope.               |
|            | [Cron](docs/architecture/cron.md)                             | Scheduled tasks registered by core and plugins.                         |
|            | [Media and storage](docs/architecture/media-and-storage.md)   | Files in the storage slot; images by role.                              |
|            | [Search](docs/architecture/search.md)                         | Entry search in core, indexing in a plugin.                             |
|            | [i18n](docs/architecture/i18n.md)                             | Every user-facing string is a Lingui descriptor.                        |
| Tooling    | [Build and CLI](docs/architecture/build-and-cli.md)           | The `plumix` CLI, the Vite plugin and the scaffolder.                   |
|            | [Dev tooling](docs/architecture/dev-tooling.md)               | Error pages, debug bar and request history, compiled out of production. |

## Codemap

- `packages/plumix`: the published umbrella. Every package outside the framework imports Plumix
  through its subpaths. It also holds the CLI (`src/cli`) and the Vite plugin (`src/vite`).
- `packages/core`: the engine, one package in five layers that import only downward
  (`packages/core/layers.ts`, [ADR 0010](docs/adr/0010-core-is-one-package-of-enforced-layers.md)):
  - **foundation**: `blocks/`, `i18n/` and small pure helpers.
  - **contracts**: `plugin/`, `hooks/`, `context/`, `db/schema/`, every `*/contract/` folder, config,
    theme and template types.
  - **capabilities**: `db/`, `meta/`, `access/`, `auth/`, `mail/`, `entries/`, `terms/`, `users/`,
    `revisions/`, `search/`, `seo/`, `images/`, `storage/`, `cdn/`, `route/`.
  - **surfaces**: `rpc/`, `rest/`, `mcp/`, `admin-area/`, `admin-bar/`, `admin/`, `dev/`,
    `dev-client/`, `cli/`, `welcome/`.
  - **top**: `runtime/`, which wires everything into a request handler.
- `packages/admin`, `admin-editor`, `admin-ui`: the admin SPA, the visual editor and their UI
  primitives.
- `packages/plugins/*`: first-party plugins, built only on public seams.
- `packages/runtimes/*`: one adapter per runtime.
- `packages/create-plumix-app`: the scaffolder.
- `apps/*`: private sites built on Plumix (demo, docs, marketing).
- `tooling/*`: workspace configs and guards, such as the published-surface roster.
- `scripts/`: scripts the repo runs, such as `pnpm test:mutation`.

## API boundaries

- **The published surface** is the `plumix` package and its subpaths, plus each plugin's and runtime
  adapter's exports. `tooling/published-surface` records a reason for every export, and
  `pnpm surface:check` fails on one without. Internal `@plumix/*` packages are free to change.
- **The plugin seam** is `definePlugin` from `plumix/plugin`: a plugin declares what it contributes and
  never reaches into core's internals.
- **The runtime contract** is `RuntimeAdapter` and the config slots in `plumix/runtime`; each adapter
  proves it with the conformance suites in `plumix/test/conformance`.
- **The wire** between the admin and the app process is oRPC, which is internal and may change in any
  minor. REST (`/_plumix/api/v1`) and MCP (`/_plumix/mcp`) are the external APIs.
- **Stability.** The published surface, hook names, REST v1 and the config shape follow the
  versioning [`VISION.md`](VISION.md#what-10-means) commits to; internal `@plumix/*` packages, the
  oRPC wire and the admin's markup carry no such promise.

## Cross-cutting concerns

- **Errors.** Each area throws its own named errors from an `errors.ts`; the admin shows a failure
  through a localized descriptor, never its message
  ([ADR 0018](docs/adr/0018-the-admin-shows-a-failure-through-a-descriptor-it-chose.md)).
- **Testing.** Three tiers: unit, e2e and smoke
  ([ADR 0042](docs/adr/0042-tests-come-in-three-tiers.md), [`CODING_STANDARDS.md`](CODING_STANDARDS.md#tests)).
- **Security.** Access is decided per entry on every surface, and a render that reads the principal is
  never shared; see [auth and access](docs/architecture/auth-and-access.md) and
  [`SECURITY.md`](SECURITY.md).
- **Caching.** Pages are cached by segment and purged by tag; see
  [CDN cache](docs/architecture/cdn-cache.md).
- **Internationalization.** Every user-facing string is a Lingui descriptor; see
  [i18n](docs/architecture/i18n.md). Entries are translated: an entry has a version per enabled
  locale, and the public site, the admin and the APIs serve each one.
- **Accessibility.** The admin and the visual editor meet WCAG 2.2 AA, and so does the HTML core's
  primitives render.
- **Portability.** A site's content exports in full with one CLI command, in a documented format.
- **Personal data.** A site admin exports or erases everything the site stores about one person
  from that user's screen in the admin; core and every plugin that stores personal data contribute
  their share; see [auth and access](docs/architecture/auth-and-access.md).
- **Observability.** In development, request history, error pages and the debug bar; see
  [dev tooling](docs/architecture/dev-tooling.md). Production export goes through the OTLP consumer on the `telemetry` slot.

## Invariants

Each is stated as something that never happens, with what guards it.

- Nothing outside the framework imports an internal `@plumix/*` package; it imports `plumix` and its
  subpaths (the umbrella rule in `AGENTS.md`, the `noInternalImports` lint config).
- No core layer imports a layer above it, and no browser code reaches a server-only module
  (`packages/core/src/layers.test.ts`).
- Core and plugin request-path code never touches a runtime's own primitives; those live in its adapter
  ([ADR 0019](docs/adr/0019-a-runtime-adapter-uses-its-runtimes-primitives-and-is-tested-on-that-runtime.md)).
- Core never takes on what would merely be absent without it; that belongs to a plugin
  ([ADR 0002](docs/adr/0002-core-owns-what-would-be-wrong.md)).
- Plumix never sends anything to a destination the site did not configure, and core never sets a
  cookie for an anonymous public visitor ([`VISION.md`](VISION.md#the-floor)).
- A render that reads the principal never reaches a shared cache
  ([ADR 0030](docs/adr/0030-a-render-that-reads-the-principal-is-never-shared.md)).
- No write lands from a stale copy or over someone else's live lease
  ([ADR 0048](docs/adr/0048-core-guards-every-edit-with-a-required-token-and-an-enforced-lease.md)).
- No dev-only code ships in a production build; each gate is an inline compile-time constant
  (`packages/plumix/src/vite/dev-gate-tree-shaking.test.ts`).

## Decisions by area

The ADRs behind each part of the system, in [`docs/adr/`](docs/adr/).

| Area                         | ADRs                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape of the system          | 0001 one platform context, 0002 core owns what would be wrong, 0010 core is one package of layers, 0011 the context carries config once, 0056 ctx.fetch is bounded by default, 0059 a scheduled task runs within a budget                                                                                                                                                                                                           |
| Runtimes                     | 0019 an adapter uses its runtime's primitives and is tested on it, 0045 remote databases come from platform config                                                                                                                                                                                                                                                                                                                  |
| Plugins and extension points | 0005 composite field hooks, 0007 an extension point hands out a query, 0009 a renamed hook breaks at compile time (superseded by 0052), [0052 a plugin extends core through events, filters and registrations](docs/adr/0052-a-plugin-extends-core-through-declared-events-filters-and-registrations.md), [0058 a plugin's state comes from its factory](docs/adr/0058-a-plugins-per-install-state-comes-from-its-state-factory.md) |
| Content and fields           | 0004 image roles are an open set, 0026 a field default is the starting value                                                                                                                                                                                                                                                                                                                                                        |
| Editing                      | 0048 every edit needs a token and a lease, [0057 an autosave stores edits](docs/adr/0057-an-autosave-stores-edits-not-a-snapshot.md)                                                                                                                                                                                                                                                                                                |
| Routing and render           | 0008 an archive is one entry query, 0012 a term is addressed by its slug, 0015 page data comes from core, 0016 a render context resolves descriptors, 0025 page kinds, 0029 a turned-off route is never compiled, 0031 page transitions, 0032 page outcomes, 0033 redirect status, 0035 an app page is a view, 0040 block deps                                                                                                      |
| Access and auth              | 0022 a capability is named by what it guards, 0024 a credential comes only from a session, 0030 a personal render is never shared, 0037 access is per entry, 0041 a sign-in method is an extension, 0050 the auth client manages the user's own account                                                                                                                                                                             |
| Mail                         | 0036 a mail is declared by name                                                                                                                                                                                                                                                                                                                                                                                                     |
| Interfaces                   | 0013 a published type is true at every boundary, 0020 REST resources are bound by core                                                                                                                                                                                                                                                                                                                                              |
| Admin                        | 0014 the admin offers only what the deployment can do, 0018 failures shown through descriptors, 0023 admin-ui owns its primitives                                                                                                                                                                                                                                                                                                   |
| Data and operations          | 0027 each owner ships its migrations, 0034 operator tasks are CLI or config, 0039 a sync replaces a scope, 0044 data migrations run after schema                                                                                                                                                                                                                                                                                    |
| Plugins' outputs             | 0006 a card renderer declares what it reads, 0028 sitemap sources                                                                                                                                                                                                                                                                                                                                                                   |
| Build and tests              | [0003 dev config mirrors the dev layers](docs/adr/0003-dev-config-mirrors-the-dev-layers.md), 0021 tests run in Node or a browser (superseded by 0042), 0038 coupled invariants, 0042 three test tiers, [0043 a build ships licences](docs/adr/0043-a-site-build-ships-the-licences-of-what-it-bundles.md), 0046 the scaffold smoke, 0049 mutation testing                                                                          |

## Keeping this true

A change that moves a box, adds a surface or breaks an invariant updates this file and the page
for that subsystem in the same PR. Pages name files and symbols, never line numbers.
