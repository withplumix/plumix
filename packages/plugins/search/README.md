# @plumix/plugin-search

This Plumix plugin keeps a **full-text index** of everything a site publishes, so a visitor can find a word from the middle of an article rather than only from its title.

This release stands the index up and keeps it current. The query surface — the public results page, ranking and snippets — lands next; until then nothing reads the index, so installing this early buys the backfill rather than the feature.

## Install

```bash
pnpm add @plumix/plugin-search
```

Then add it to your `plumix.config.ts`:

```ts
import { plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import { search } from "@plumix/plugin-search";

export default plumix({
  // …your runtime, database, and auth
  plugins: [blog(), search()],
});
```

The plugin owns a table and DDL that drizzle cannot express, so generate and apply migrations once after installing:

```bash
plumix migrate generate
```

## How it stays current

```
entries ──[trigger: enqueue on a real change]──▶ entry change feed
change feed ──[extract prose]──▶ search_documents
search_documents ──[trigger]──▶ FTS5 index
```

Both boundaries where the index could drift from the content are closed **in the database**, so a seed, a migration, a bulk import or a direct write cannot bypass them. Only the middle hop runs in JavaScript, because stripping HTML out of block content needs a language SQLite does not have.

Saving an entry through the editor indexes it after the response is sent, so nobody waits for it. Anything that path misses — a row written straight to the database, an isolate that died mid-request — is caught the next time the feed is drained on the site's scheduled trigger. The drain is bounded per invocation, so a backlog spreads over several rather than running one past the platform's limits.

The FTS5 index and its triggers are DDL that drizzle cannot express, so they ship as a raw SQL migration — and the drain re-creates them if they are missing, which turns a migration that never ran into a delay rather than an outage.

A save that leaves the text where it was writes nothing: the change feed's own guard ignores it, and the projection's upsert is a no-op when the extracted text has not moved. Bulk status changes stay cheap.

## What is indexed

Every entry of a type that is searchable — which is every public type, with no extra declaration. A type opts out with one field:

```ts
ctx.registerEntryType("ledger", { label: "Ledger", excludeFromSearch: true });
```

A non-public type (`isPublic: false`) is excluded already, so internal types need no second switch.

Each entry contributes its title, its excerpt, and the text its blocks declare — including table cells, button labels, list items, image alt text and code listings. A block says which of its inputs carry text; a block that declares nothing contributes nothing. The declaration is data, so an extractor version can be derived by hashing the whole roster rather than maintained by hand, and every document is stamped with the version that produced it. Re-indexing the documents an older version left behind is the rebuild slice's job — until it lands, a block that changes its declaration reaches an entry the next time that entry is saved.

Users and form submissions are never indexed. They are personal data, and a predicate a public query forgets cannot leak what the table never held.

Status is not filtered here. Drafts and trashed entries are in the projection so an author can find their own unpublished work in the admin; keeping them out of public results is the query surface's job.

## Storage

Search roughly doubles the size of the database. On Cloudflare D1, whose per-database limit is 10 GB, that puts the ceiling around 480 000 entries with search enabled and nothing else in the database. Beyond that is a second database, not a tuning problem.
