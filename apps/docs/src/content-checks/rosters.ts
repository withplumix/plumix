// The roster-drift guard: what binds a roster page to the source it promises
// to enumerate.
//
// A roster page says *this is all of them*. When it falls behind its source it
// does not merely become incomplete — it lies, because a reader treats an
// omission as evidence the thing does not exist.
//
// Each roster below holds its item ids **once**, and two assertions pin that
// list from both sides:
//
//   1. To the source. Either a type-level binding here, or a runtime
//      comparison in `rosters.test.ts` — see "which binding" below.
//   2. To the page, by `checkRosterDrift`, which reads the page's `###`
//      headings and reports either direction of disagreement.
//
// Transitively that is page ≡ source, with no code generation and no change to
// the product.
//
// **Which binding.** Bind type-level when the source's declared type carries
// its values — a `as const` array, a record with literal keys — because then
// `pnpm typecheck` fails the moment source gains a value the list lacks, which
// is the fastest signal available. Bind at runtime when the source's own
// annotation widens them away (`readonly BlockSpec[]`, `Record<string, …>`):
// `typeof` has nothing left to compare, and the runtime comparison is stricter
// anyway, pinning order as well as membership. Type-only sources — hooks,
// hydration strategies, config options — have no runtime form at all, so the
// type-level binding is the only one available to them.
//
// **The item id is the `###` heading's text**, exactly as the source spells the
// item — for a heading carrying a signature, the signature as written. Two
// things settle this. MDX cannot express the `{#id}` suffix the IA spec asks
// for: braces open an expression, and `{#id}` is not one, so the page fails to
// parse. And the heading's text is what generates its anchor, so pinning the
// text pins the anchor a reader or an agent cites. Text rather than that
// slugified anchor is what the guard compares, because the slug is lossy —
// `userList` and `userlist` share an anchor, but only one is the name the
// source uses.
//
// **Adding a roster:** append an entry here, hold its items in source order,
// bind it, and that is the whole of it. Nothing else re-decides. Two cases the
// next eleven will meet:
//
// - **A module or manifest export** — template builders, CLI commands, the
//   façade subpaths in `package.json` — is a runtime source like any other, so
//   it is a runtime comparison. Read it through the `plumix` façade.
// - **A page item its source does not carry.** The guard reports it, which is
//   the point: extend the list and say in a comment which source the extra
//   item answers to. Silence would make the roster's promise unenforceable.

import type { CANONICAL_INPUT_TYPES } from "plumix/fields";
import type { EntryStatus, UserRole } from "plumix/schema";

import type { Roster } from "./roster-drift";
import type { Assert, Equals } from "./type-assert";

/**
 * Every field type authorable out of the box, in family order. Source:
 * `CANONICAL_INPUT_TYPES`. The three legacy types are deliberately absent —
 * they are retired, and the IA spec leaves them undocumented — as are the
 * plugin-contributed `media` kinds, which `@plumix/plugin-media` ships rather
 * than core.
 */
const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "url",
  "password",
  "date",
  "datetime",
  "time",
  "number",
  "color",
  "range",
  "json",
  "user",
  "userList",
  "entry",
  "entryList",
  "term",
  "termList",
  "select",
  "toggle",
  "richtext",
  "repeater",
  "group",
  "link",
] as const;

type _FieldTypesMatchSource = Assert<
  Equals<(typeof FIELD_TYPES)[number], (typeof CANONICAL_INPUT_TYPES)[number]>
>;

/** The five roles, ascending. Source: `USER_ROLES`. */
const ROLES = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "admin",
] as const;

type _RolesMatchSource = Assert<Equals<(typeof ROLES)[number], UserRole>>;

/** The four statuses an entry moves between. Source: `ENTRY_STATUSES`. */
const STATUSES = ["draft", "published", "scheduled", "trash"] as const;

type _StatusesMatchSource = Assert<
  Equals<(typeof STATUSES)[number], EntryStatus>
>;

/**
 * The core capabilities, then the actions derived for every other entry type
 * and taxonomy. Sources: `CORE_CAPABILITIES`, `POST_TYPE_CAPABILITY_ACTIONS`,
 * `TERM_TAXONOMY_CAPABILITY_ACTIONS`.
 *
 * The derived actions are spelled `entry:*:read` rather than bare `read`,
 * following how `rbac.ts` itself writes `entry:post:*`: an id is unique on its
 * page, and `read` names both an entry action and a taxonomy one.
 *
 * Bound at runtime as a whole. `CORE_CAPABILITIES` is annotated
 * `Record<string, UserRole>`, so its keys are `string` at the type level even
 * though they are literals in source — binding half the list one way and half
 * the other would cost a reader more than it buys.
 */
const CAPABILITIES = [
  "entry:post:read",
  "entry:post:create",
  "entry:post:edit_own",
  "entry:post:publish",
  "entry:post:edit_any",
  "entry:post:delete",
  "entry:post:read_revisions",
  "entry:post:restore_revision",
  "user:list",
  "user:edit_own",
  "user:create",
  "user:edit",
  "user:promote",
  "user:delete",
  "user:manage_tokens",
  "plugin:manage",
  "settings:manage",
  "entry:*:read",
  "entry:*:create",
  "entry:*:edit_own",
  "entry:*:publish",
  "entry:*:edit_any",
  "entry:*:delete",
  "entry:*:read_revisions",
  "entry:*:restore_revision",
  "term:*:read",
  "term:*:assign",
  "term:*:edit",
  "term:*:delete",
  "term:*:manage",
] as const;

/**
 * Every block core registers, in registration order. Source: `coreBlocks`,
 * whose `readonly BlockSpec[]` annotation puts the names out of reach of a
 * type-level binding.
 *
 * `core/html` is deliberately absent: it ships in the package but registers
 * opt-in, and the `plumix` façade does not export it. A page documenting it
 * alongside these adds it here with that noted.
 */
const CORE_BLOCKS = [
  "core/rich-text",
  "core/separator",
  "core/code",
  "core/group",
  "core/section",
  "core/columns",
  "core/column",
  "core/button",
  "core/details",
  "core/video",
  "core/embed",
  "core/table",
  "core/table-header-row",
  "core/table-body-row",
  "core/table-header-cell",
  "core/table-cell",
  "core/pattern-ref",
] as const;

/** Every inline mark, in bubble-menu order. Source: `coreMarks`. */
const CORE_MARKS = [
  "bold",
  "italic",
  "strike",
  "code",
  "link",
  "underline",
  "subscript",
  "superscript",
  "highlight",
  "kbd",
  "abbr",
  "cite",
  "small",
] as const;

/** Every guarded roster, keyed by the page that carries it. */
export const ROSTERS: readonly Roster[] = [
  { page: "fields/field-types.mdx", items: FIELD_TYPES },
  { page: "blocks/core-blocks.mdx", items: CORE_BLOCKS },
  { page: "blocks/marks.mdx", items: CORE_MARKS },
  { page: "access/roles.mdx", items: ROLES },
  { page: "access/capabilities.mdx", items: CAPABILITIES },
  { page: "content-modelling/statuses.mdx", items: STATUSES },
];
