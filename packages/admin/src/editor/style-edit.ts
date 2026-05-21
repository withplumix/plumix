import type { ResponsiveStyleSlot } from "@plumix/blocks";

import type { StyleBucket } from "./viewport-bucket.js";

export function setStyleProperty(
  style: ResponsiveStyleSlot | undefined,
  bucket: StyleBucket,
  property: string,
  tokenId: string | undefined,
): ResponsiveStyleSlot | undefined {
  const nextBucket: Record<string, string> = { ...(style?.[bucket] ?? {}) };
  if (tokenId === undefined) {
    delete nextBucket[property];
  } else {
    nextBucket[property] = tokenId;
  }
  const { [bucket]: _omit, ...rest } = style ?? {};
  const merged: ResponsiveStyleSlot =
    Object.keys(nextBucket).length === 0
      ? rest
      : { ...rest, [bucket]: nextBucket };
  return Object.keys(merged).length === 0 ? undefined : merged;
}
