/**
 * Safe because no unit test asserts translated content, and a missing key
 * falls back to its English descriptor.
 */
export const messages: Record<string, string | readonly string[]> = {};

/** A catalog index's stand-in where no `.po` listing is read: no locale ships. */
export const catalogs: Readonly<
  Record<string, () => Promise<{ readonly messages: typeof messages }>>
> = {};
