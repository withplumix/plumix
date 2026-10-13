import { describe, expect, test } from "vitest";

import { describeCardPreview } from "./card-preview-view.js";

describe("describeCardPreview", () => {
  test("a featured photo is named, with why the card stood aside", () => {
    expect(
      describeCardPreview({
        outcome: "featured",
        skipped: "featured-preferred",
        src: "https://media.example/hero.jpg",
      }),
    ).toEqual({
      outcome: {
        id: "plugin.og.preview.outcome.featured",
        message: "This entry's featured image.",
      },
      skipped: {
        id: "plugin.og.preview.skip.featuredPreferred",
        message: "The card steps aside for the featured image.",
      },
      showImage: true,
    });
  });

  test("an unreachable entry is named as why there is no card", () => {
    expect(
      describeCardPreview({
        outcome: "site-default",
        skipped: "not-shareable",
        src: "https://cdn.example/default.png",
      }).skipped,
    ).toEqual({
      id: "plugin.og.preview.skip.notShareable",
      message: "No card: this entry is not publicly reachable.",
    });
  });

  test("a generated card gives no reason, since nothing stood aside", () => {
    expect(
      describeCardPreview({
        outcome: "card",
        skipped: null,
        src: "data:image/png;base64,AAAA",
      }).skipped,
    ).toBeNull();
  });

  test("the frame stays empty where the chain resolved to nothing", () => {
    expect(
      describeCardPreview({
        outcome: "site-default",
        skipped: "no-rule",
        src: null,
      }).showImage,
    ).toBe(false);
  });
});
