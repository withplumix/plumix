import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { LoadMoreError } from "./load-more-error.js";

describe("LoadMoreError", () => {
  test("announces a failed load in an alert", () => {
    expect(
      renderToStaticMarkup(<LoadMoreError error="Could not load comments." />),
    ).toBe(
      '<p class="plumix-comment-error" role="alert">Could not load comments.</p>',
    );
  });

  test("renders nothing while no load has failed", () => {
    expect(renderToStaticMarkup(<LoadMoreError error={null} />)).toBe("");
  });
});
