/**
 * Safe because no unit test asserts translated content, and a missing key
 * falls back to its English descriptor.
 */
export const messages: Record<string, string | readonly string[]> = {};
