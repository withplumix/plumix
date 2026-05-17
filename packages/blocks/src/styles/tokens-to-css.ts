import type { ThemeTokenGroup, ThemeTokens } from "./types.js";

interface GroupConfig {
  readonly varPrefix: string;
  readonly utilities: readonly { suffix: string; cssProperty: string }[];
}

const GROUPS: Readonly<Record<keyof ThemeTokens, GroupConfig>> = {
  colors: {
    varPrefix: "--plumix-color",
    utilities: [
      { suffix: "background-color", cssProperty: "background-color" },
      { suffix: "color", cssProperty: "color" },
    ],
  },
  spacing: {
    varPrefix: "--plumix-spacing",
    utilities: [
      { suffix: "padding", cssProperty: "padding" },
      { suffix: "margin", cssProperty: "margin" },
    ],
  },
  typography: {
    varPrefix: "--plumix-typography",
    utilities: [
      { suffix: "font-size", cssProperty: "font-size" },
      { suffix: "line-height", cssProperty: "line-height" },
      { suffix: "font-weight", cssProperty: "font-weight" },
    ],
  },
  border: {
    varPrefix: "--plumix-border",
    utilities: [{ suffix: "border-radius", cssProperty: "border-radius" }],
  },
};

/**
 * Pure CSS-string generator: turns a `ThemeTokens` value into a single
 * stylesheet declaring CSS custom properties on `:root` and the
 * utility classes `resolveBlockStyles` emits. The Vite plugin's
 * `virtual:plumix/blocks/tokens.css` virtual module returns this
 * string at build time so the bundle ships exactly the variables the
 * active theme declared — empty groups produce no output, missing
 * groups skip cleanly.
 */
export function tokensToCss(tokens: ThemeTokens): string {
  const varDecls: string[] = [];
  const utilityBlocks: string[] = [];
  for (const [groupKey, config] of Object.entries(GROUPS) as [
    keyof ThemeTokens,
    GroupConfig,
  ][]) {
    const group: ThemeTokenGroup | undefined = tokens[groupKey];
    if (!group) continue;
    for (const [slug, entry] of Object.entries(group)) {
      const varName = `${config.varPrefix}-${slug}`;
      varDecls.push(`  ${varName}: ${entry.value};`);
      for (const util of config.utilities) {
        utilityBlocks.push(
          `.has-${slug}-${util.suffix} { ${util.cssProperty}: var(${varName}); }`,
        );
      }
    }
  }
  if (varDecls.length === 0) return "";
  return [":root {", ...varDecls, "}", ...utilityBlocks].join("\n");
}
