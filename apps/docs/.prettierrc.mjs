import base from "@plumix/prettier-config";

/**
 * This app is the only workspace with `.astro` files, so the Astro parser is
 * wired here rather than in the shared config every other package loads.
 *
 * @type {import("prettier").Config}
 */
export default {
  ...base,
  // Astro goes first: `prettier-plugin-tailwindcss` wraps whichever parser
  // precedes it and has to stay last.
  plugins: ["prettier-plugin-astro", ...base.plugins],
};
