import type { CardRenderer, FontFormat } from "./renderer.js";
import { BUNDLED_ENGINE_FONTS, FONT_FORMATS } from "./renderer.js";

/**
 * The configured font set split by what the connected renderer can do with it,
 * decided once from that renderer's own declaration. Both the renderer and the
 * set are fixed for the life of the plugin, so nothing here is per-request.
 */
export interface CardFontPlan {
  /**
   * Faces the renderer will be handed, in the configured fallback order. This
   * is what the digest names: a face the renderer never receives is not an
   * input to the bytes it produces.
   */
  readonly readable: readonly string[];
  /**
   * Configured faces in a format this renderer cannot parse. Kept out of the
   * digest — they reach no render — but a render fails on them when they are
   * all a site configured, because the alternative is a card with no text.
   */
  readonly unreadable: readonly string[];
  /**
   * Configured faces against a renderer that reads none at all. Not an error:
   * the set is simply not addressed to this renderer. Surfaced in development
   * so the dead config is visible to whoever wrote it.
   */
  readonly ignored: readonly string[];
  /** What the renderer declared it reads — the list a refusal names. */
  readonly formats: readonly FontFormat[];
}

/**
 * Split a configured font set against what the renderer declared it reads.
 *
 * Format comes from the path, which is the only thing there is to read before
 * a face is fetched — and deciding without fetching one is the whole point.
 */
export function planCardFonts(
  renderer: CardRenderer,
  configured: readonly string[],
): CardFontPlan {
  const formats = rendererFontFormats(renderer);
  const readable: string[] = [];
  const rejected: string[] = [];
  for (const path of configured) {
    const format = formatOf(path);
    if (format !== undefined && formats.includes(format)) readable.push(path);
    else rejected.push(path);
  }
  // A renderer reading no format was never addressed by this set, so the whole
  // of it is dead config rather than a failed render. `false` and an empty
  // format list are the two ways the type spells that, and they mean the same.
  const readsNothing = formats.length === 0;
  return {
    readable,
    unreadable: readsNothing ? [] : rejected,
    ignored: readsNothing ? rejected : [],
    formats,
  };
}

function rendererFontFormats(renderer: CardRenderer): readonly FontFormat[] {
  if (renderer.fonts === false) return [];
  return renderer.fonts?.formats ?? BUNDLED_ENGINE_FONTS.formats;
}

function formatOf(path: string): FontFormat | undefined {
  // A configured path is read straight out of the asset layer, so it carries
  // whatever a cache-busting query or fragment put on it. Neither is part of
  // the filename the format is named by.
  const filename = path.split(/[?#]/)[0] ?? "";
  const extension = filename.split(".").pop()?.toLowerCase();
  return FONT_FORMATS.find((format) => format === extension);
}
