// Revision rows reuse the `entries` table with reserved `type='revision'`
// and a `revision:<entryId>:<nanoid>` slug — the `<entryId>` segment
// lets the repository scope queries without a JOIN, the `<nanoid>`
// segment dodges the `(type, slug)` unique index.
export const REVISION_TYPE = "revision";

const REVISION_SLUG_PATTERN = /^revision:(\d+):([^:]+)$/;

interface DecodedRevisionSlug {
  readonly entryId: number;
  readonly nanoid: string;
}

export function buildRevisionSlug(parts: DecodedRevisionSlug): string {
  return `revision:${String(parts.entryId)}:${parts.nanoid}`;
}

export function decodeRevisionSlug(
  slug: string,
): DecodedRevisionSlug | undefined {
  const match = REVISION_SLUG_PATTERN.exec(slug);
  if (!match) return undefined;
  const [, entryIdRaw, nanoid] = match;
  if (!entryIdRaw || !nanoid) return undefined;
  const entryId = Number.parseInt(entryIdRaw, 10);
  if (!Number.isInteger(entryId) || entryId <= 0) return undefined;
  return { entryId, nanoid };
}

export function isRevisionType(type: unknown): type is typeof REVISION_TYPE {
  return type === REVISION_TYPE;
}

// Per-user pending edit on a published entry. Same table as the live
// row + revision row, distinguished by `type='autosave'` and a slug of
// `autosave:<entryId>:<authorId>`. The deterministic shape lets the
// existing `UNIQUE (type, slug)` index enforce one autosave per
// (entry, user) — no separate dedup query at write time.
export const AUTOSAVE_TYPE = "autosave";

const AUTOSAVE_SLUG_PATTERN = /^autosave:(\d+):(\d+)$/;

interface DecodedAutosaveSlug {
  readonly entryId: number;
  readonly authorId: number;
}

export function buildAutosaveSlug(parts: DecodedAutosaveSlug): string {
  return `autosave:${String(parts.entryId)}:${String(parts.authorId)}`;
}

export function decodeAutosaveSlug(
  slug: string,
): DecodedAutosaveSlug | undefined {
  const match = AUTOSAVE_SLUG_PATTERN.exec(slug);
  if (!match) return undefined;
  const [, entryIdRaw, authorIdRaw] = match;
  if (!entryIdRaw || !authorIdRaw) return undefined;
  const entryId = Number.parseInt(entryIdRaw, 10);
  const authorId = Number.parseInt(authorIdRaw, 10);
  if (!Number.isInteger(entryId) || entryId <= 0) return undefined;
  if (!Number.isInteger(authorId) || authorId <= 0) return undefined;
  return { entryId, authorId };
}

export function isAutosaveType(type: unknown): type is typeof AUTOSAVE_TYPE {
  return type === AUTOSAVE_TYPE;
}

// Reserved-type guard for entry CRUD: both revision and autosave rows
// live in the same table as public entries but are off-limits to
// callers — they're written by framework code only. Use this at every
// write surface (`entry.create`, `entry.update`) to reject the type
// before it can land in the database.
export function isReservedType(type: unknown): boolean {
  return isRevisionType(type) || isAutosaveType(type);
}
