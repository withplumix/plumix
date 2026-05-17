import { describe, expect, test } from "vitest";

import type { MarkComponent } from "@plumix/blocks";

import { auth } from "../auth/config.js";
import { plumix } from "../config.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";

const baseConfig = {
  runtime: {
    name: "test",
    buildFetchHandler: () => () => new Response("stub", { status: 500 }),
  },
  database: {
    kind: "test",
    connect: () => ({ db: {} }),
  },
  auth: auth({
    passkey: {
      rpName: "Plumix Test",
      rpId: "cms.example",
      origin: "https://cms.example",
    },
  }),
};

// Identity sentinels — never rendered; the test only asserts component
// references survive the theme → buildApp → registry handoff.
const AlternateBold: MarkComponent = function AlternateBold() {
  return null;
};
const ItalicA: MarkComponent = function ItalicA() {
  return null;
};
const ItalicB: MarkComponent = function ItalicB() {
  return null;
};

describe("buildApp threads theme mark + block overrides into the registries", () => {
  test("defineTheme({ marks: { bold: Component } }) replaces app.marks.get('bold').component", async () => {
    const theme = defineTheme({
      id: "override-bold",
      marks: { bold: AlternateBold },
    });
    const app = await buildApp(
      plumix({
        ...baseConfig,
        themes: [theme],
      }),
    );

    expect(app.marks.get("bold")?.component).toBe(AlternateBold);
  });

  test("multiple themes — last theme wins per-mark, others persist", async () => {
    const themeA = defineTheme({
      id: "theme-a",
      marks: { italic: ItalicA, bold: AlternateBold },
    });
    const themeB = defineTheme({
      id: "theme-b",
      marks: { italic: ItalicB },
    });
    const app = await buildApp(
      plumix({
        ...baseConfig,
        themes: [themeA, themeB],
      }),
    );

    expect(app.marks.get("italic")?.component).toBe(ItalicB);
    expect(app.marks.get("bold")?.component).toBe(AlternateBold);
  });

  test("theme override targeting an unknown mark name raises markRegistration error", async () => {
    const theme = defineTheme({
      id: "broken-theme",
      marks: { "not-a-real-mark": AlternateBold },
    });
    await expect(
      buildApp(
        plumix({
          ...baseConfig,
          themes: [theme],
        }),
      ),
    ).rejects.toThrow(/not-a-real-mark/);
  });
});
