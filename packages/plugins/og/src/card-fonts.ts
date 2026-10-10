import type { CardRenderer, FontFormat } from "./renderer.js";
import { BUNDLED_ENGINE_FONTS, FONT_FORMATS } from "./renderer.js";

/** Decided once: the renderer and font set are fixed for the plugin's life. */
export interface CardFontPlan {
  /** In fallback order. Only these are digested. */
  readonly readable: readonly string[];
  /**
   * Not digested, but a render fails when these are all a site configured,
   * since the alternative is a card with no text.
   */
  readonly unreadable: readonly string[];
  /**
   * For a renderer that reads no fonts. Not an error; surfaced in development.
   */
  readonly ignored: readonly string[];
  /** What the renderer declared it reads — the list a refusal names. */
  readonly formats: readonly FontFormat[];
}

/** Format comes from the path, so nothing is fetched to decide. */
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
  // `false` and an empty format list both mean the renderer reads no fonts.
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
  // Strip any cache-busting query or fragment.
  const filename = path.split(/[?#]/)[0] ?? "";
  const extension = filename.split(".").pop()?.toLowerCase();
  return FONT_FORMATS.find((format) => format === extension);
}
