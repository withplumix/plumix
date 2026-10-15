import type { BlockNode } from "@plumix/core/blocks";
import { resolveRootTag } from "@plumix/core/blocks";

import type { StyleBucket } from "./store.js";

/**
 * The buckets whose values cascade into each one, nearest first: the large
 * bucket has no @media, medium narrows it, small narrows medium.
 */
const WIDER_BUCKETS: Readonly<Record<StyleBucket, readonly StyleBucket[]>> = {
  large: [],
  medium: ["large"],
  small: ["medium", "large"],
};

/**
 * Styles cascade desktop-first, so an unset value renders the nearest wider
 * device's; the controls show it so the author can see where it comes from.
 */
export function inheritedStyleValue(
  style: BlockNode["style"],
  bucket: StyleBucket,
  property: string,
): string | undefined {
  for (const wider of WIDER_BUCKETS[bucket]) {
    const stored = style?.[wider]?.[property];
    if (typeof stored === "string" && stored !== "") return stored;
  }
  return undefined;
}

/**
 * A non-url() value (a gradient set via raw CSS) yields "" rather than a form
 * the field can't represent.
 */
export function parseBackgroundImageUrl(value: string | undefined): string {
  const match = value?.match(/^url\((['"]?)(.*)\1\)$/);
  return match?.[2] ?? "";
}

/** The stored `url()` for a bare URL, or `null` to clear for a blank one. */
export function formatBackgroundImageUrl(url: string): string | null {
  const trimmed = url.trim();
  return trimmed === "" ? null : `url("${trimmed}")`;
}

export interface TextShadowParts {
  readonly x: string;
  readonly y: string;
  readonly blur: string;
  readonly color: string;
}

/**
 * A text-shadow as its offset/blur/color parts. Enabling seeds a soft default;
 * each field recomposes the whole `x y blur color` value.
 */
export const DEFAULT_TEXT_SHADOW: TextShadowParts = {
  x: "1",
  y: "1",
  blur: "3",
  color: "#000000",
};

/**
 * Hex-only: a space-separated color like `rgb(0 0 0)` from raw CSS doesn't
 * round-trip and resets to the default hex on the next edit.
 */
export function parseTextShadow(value: string | undefined): TextShadowParts {
  if (!value) return DEFAULT_TEXT_SHADOW;
  const parts = value.trim().split(/\s+/);
  const len = (raw: string | undefined, fallback: string): string =>
    raw ? raw.replace("px", "") : fallback;
  return {
    x: len(parts[0], DEFAULT_TEXT_SHADOW.x),
    y: len(parts[1], DEFAULT_TEXT_SHADOW.y),
    blur: len(parts[2], DEFAULT_TEXT_SHADOW.blur),
    color: parts[3] ?? DEFAULT_TEXT_SHADOW.color,
  };
}

export function formatTextShadow(parts: TextShadowParts): string {
  return `${parts.x}px ${parts.y}px ${parts.blur}px ${parts.color}`;
}

/**
 * Underline and strikethrough share `text-decoration`, so they're mutually
 * exclusive.
 */
export const TEXT_MARKS = [
  { id: "bold", property: "fontWeight", on: "bold" },
  { id: "italic", property: "fontStyle", on: "italic" },
  { id: "underline", property: "textDecoration", on: "underline" },
  { id: "strikethrough", property: "textDecoration", on: "line-through" },
] as const;

export type TextMarkId = (typeof TEXT_MARKS)[number]["id"];

export interface StyleWrite {
  readonly property: string;
  readonly value: string | null;
}

/** The marks whose property holds their value. */
export function pressedTextMarks(
  valueOf: (property: string) => string | undefined,
): TextMarkId[] {
  return TEXT_MARKS.filter((m) => valueOf(m.property) === m.on).map(
    (m) => m.id,
  );
}

/**
 * Radix hands back the full pressed set; write only the mark whose state
 * flipped (exactly one per click).
 */
export function toggleTextMark(
  valueOf: (property: string) => string | undefined,
  pressed: readonly string[],
): readonly StyleWrite[] {
  const writes: StyleWrite[] = [];
  for (const mark of TEXT_MARKS) {
    const on = valueOf(mark.property) === mark.on;
    const wantOn = pressed.includes(mark.id);
    if (on !== wantOn) {
      writes.push({ property: mark.property, value: wantOn ? mark.on : null });
    }
  }
  return writes;
}

/**
 * Radix Select forbids an empty item value, so the "clear" choice carries a
 * sentinel that maps back to `null` (property absent) on change.
 */
export const KEYWORD_NONE = "__unset__";

export function encodeKeyword(value: string | undefined): string {
  return value ?? KEYWORD_NONE;
}

export function decodeKeyword(choice: string): string | null {
  return choice === KEYWORD_NONE ? null : choice;
}

/**
 * Radix Select forbids an empty item value, so "Default" (no override → the
 * block's own element) carries a sentinel that maps to an empty string.
 */
export const TAG_DEFAULT = "__default__";

/** A stale value shows as "Default", matching what the renderer emits. */
export function tagNameChoice(value: string | undefined): string {
  return resolveRootTag(value) ?? TAG_DEFAULT;
}
