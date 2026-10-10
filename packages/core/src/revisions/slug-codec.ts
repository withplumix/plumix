// The `<entryId>` segment scopes queries without a JOIN; the `<nanoid>` dodges
// the `(type, slug)` unique index.
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

// The deterministic `autosave:<entryId>:<authorId>` slug lets `UNIQUE (type,
// slug)` enforce one autosave per entry and user.
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

/** The types the editor owns inside `entries`. The change-feed triggers
 *  inline these values, so a type added here without a matching migration
 *  would land on the feed as content. */
export const RESERVED_TYPES = [REVISION_TYPE, AUTOSAVE_TYPE] as const;

export function isReservedType(type: unknown): boolean {
  return RESERVED_TYPES.some((reserved) => reserved === type);
}
