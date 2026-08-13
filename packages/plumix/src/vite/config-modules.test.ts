import { describe, expect, test } from "vitest";

import { extractConfigModules } from "./config-modules.js";

const PLUMIX = `import { plumix } from "plumix";`;

describe("extractConfigModules", () => {
  test("traces the theme module and plugin packages from a config", () => {
    const result = extractConfigModules(
      `${PLUMIX}
       import { blogTheme } from "./theme";
       import media from "@plumix/plugin-media";
       export default plumix({ theme: blogTheme, plugins: [media()] });`,
    );
    expect(result).toEqual({
      theme: "./theme",
      plugins: ["@plumix/plugin-media"],
    });
  });

  test("traces a plugin passed as a bare descriptor binding", () => {
    const result = extractConfigModules(
      `${PLUMIX}
       import { audit } from "@plumix/plugin-audit-log";
       export default plumix({ plugins: [audit] });`,
    );
    expect(result).toEqual({
      theme: undefined,
      plugins: ["@plumix/plugin-audit-log"],
    });
  });

  test("returns undefined theme when none is declared", () => {
    const result = extractConfigModules(
      `${PLUMIX}
       import media from "@plumix/plugin-media";
       export default plumix({ plugins: [media()] });`,
    );
    expect(result.theme).toBeUndefined();
    expect(result.plugins).toEqual(["@plumix/plugin-media"]);
  });

  test("returns no plugins when none are declared", () => {
    const result = extractConfigModules(
      `${PLUMIX}
       import { blogTheme } from "./theme";
       export default plumix({ theme: blogTheme });`,
    );
    expect(result).toEqual({ theme: "./theme", plugins: [] });
  });

  test("finds the factory even when `plumix` is imported under an alias", () => {
    const result = extractConfigModules(
      `import { plumix as p } from "plumix";
       import { blogTheme } from "./theme";
       export default p({ theme: blogTheme });`,
    );
    expect(result.theme).toBe("./theme");
  });

  test("traces a config assigned to a const before export", () => {
    const result = extractConfigModules(
      `${PLUMIX}
       import { blogTheme } from "./theme";
       import media from "@plumix/plugin-media";
       const config = plumix({ theme: blogTheme, plugins: [media()] });
       export default config;`,
    );
    expect(result).toEqual({
      theme: "./theme",
      plugins: ["@plumix/plugin-media"],
    });
  });

  test("skips a plugin entry that isn't a traceable import binding", () => {
    const result = extractConfigModules(
      `${PLUMIX}
       import media from "@plumix/plugin-media";
       export default plumix({ plugins: [media(), makePlugin()] });`,
    );
    // `makePlugin()` has no import binding — dropped, media kept.
    expect(result.plugins).toEqual(["@plumix/plugin-media"]);
  });
});
