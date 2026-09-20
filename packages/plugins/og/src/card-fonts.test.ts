import { describe, expect, test } from "vitest";

import type { CardRenderer } from "./renderer.js";
import { planCardFonts } from "./card-fonts.js";
import { createFakeRenderer } from "./test/fake-renderer.js";

function rendererReading(fonts: CardRenderer["fonts"]): CardRenderer {
  return createFakeRenderer({ fonts }).renderer;
}

describe("planning a card's fonts against its renderer", () => {
  test("reads every configured face for a renderer that declares nothing", () => {
    const plan = planCardFonts(rendererReading(undefined), [
      "/fonts/A.ttf",
      "/fonts/B.otf",
      "/fonts/C.woff",
    ]);

    expect(plan.readable).toEqual([
      "/fonts/A.ttf",
      "/fonts/B.otf",
      "/fonts/C.woff",
    ]);
    expect(plan.unreadable).toEqual([]);
    expect(plan.ignored).toEqual([]);
  });

  test("keeps the configured fallback order when it drops a face", () => {
    const plan = planCardFonts(rendererReading(undefined), [
      "/fonts/A.woff2",
      "/fonts/B.ttf",
      "/fonts/C.woff2",
      "/fonts/D.otf",
    ]);

    expect(plan.readable).toEqual(["/fonts/B.ttf", "/fonts/D.otf"]);
    expect(plan.unreadable).toEqual(["/fonts/A.woff2", "/fonts/C.woff2"]);
  });

  test("calls a whole set ignored, not unreadable, when the renderer reads none", () => {
    const plan = planCardFonts(rendererReading(false), ["/fonts/A.ttf"]);

    // The distinction is the difference between a no-op and a failed card:
    // the set was never addressed to this renderer.
    expect(plan.ignored).toEqual(["/fonts/A.ttf"]);
    expect(plan.unreadable).toEqual([]);
    expect(plan.readable).toEqual([]);
  });

  test("treats an empty format list as a renderer that reads no fonts", () => {
    // The same state as `false`, spelled the other way the public type allows.
    // Calling it unreadable would fail every card on a site that configured a
    // font set, which is the opposite of what declaring it asks for.
    const plan = planCardFonts(rendererReading({ formats: [] }), [
      "/fonts/A.ttf",
    ]);

    expect(plan.ignored).toEqual(["/fonts/A.ttf"]);
    expect(plan.unreadable).toEqual([]);
    expect(plan.readable).toEqual([]);
  });

  test("reads a cache-busted path by its extension, not its query string", () => {
    const plan = planCardFonts(rendererReading(undefined), [
      "/fonts/Inter.ttf?v=2",
      "/fonts/Bold.otf#hash",
    ]);

    expect(plan.readable).toEqual([
      "/fonts/Inter.ttf?v=2",
      "/fonts/Bold.otf#hash",
    ]);
    expect(plan.unreadable).toEqual([]);
  });

  test("matches an extension whatever case it is written in", () => {
    const plan = planCardFonts(rendererReading(undefined), ["/fonts/A.TTF"]);

    expect(plan.readable).toEqual(["/fonts/A.TTF"]);
  });

  test("cannot read a path that carries no extension at all", () => {
    const plan = planCardFonts(rendererReading(undefined), ["/fonts/Inter"]);

    expect(plan.unreadable).toEqual(["/fonts/Inter"]);
  });
});
