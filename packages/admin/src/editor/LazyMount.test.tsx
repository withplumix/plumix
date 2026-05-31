import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { installFakeIntersectionObserver } from "./intersection-observer-harness.js";
import { LazyMount } from "./LazyMount.js";

const { intersect } = installFakeIntersectionObserver();

afterEach(() => {
  cleanup();
});

describe("LazyMount", () => {
  test("does not render children until the placeholder enters the viewport", () => {
    render(
      <LazyMount placeholderTestId="placeholder">
        <span data-testid="payload">payload</span>
      </LazyMount>,
    );

    expect(screen.queryByTestId("payload")).toBeNull();
    expect(screen.getByTestId("placeholder")).toBeInTheDocument();
  });

  test("renders children after the observer reports intersection", () => {
    render(
      <LazyMount placeholderTestId="placeholder">
        <span data-testid="payload">payload</span>
      </LazyMount>,
    );

    intersect();

    expect(screen.getByTestId("payload")).toBeInTheDocument();
  });
});
