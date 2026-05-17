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
