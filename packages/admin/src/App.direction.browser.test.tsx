import { cleanup, render } from "@testing-library/react";
import { Direction } from "radix-ui";
import { afterEach, describe, expect, test } from "vitest";

/**
 * The provider and the primitives' `useDirection` must share one
 * `@radix-ui/react-direction` instance, or RTL silently falls back to LTR.
 */
function DirectionProbe() {
  return <span data-testid="resolved-dir">{Direction.useDirection()}</span>;
}

describe("admin RTL direction context", () => {
  afterEach(cleanup);

  test("the umbrella DirectionProvider feeds the direction radix primitives read", () => {
    const { getByTestId } = render(
      <Direction.DirectionProvider dir="rtl">
        <DirectionProbe />
      </Direction.DirectionProvider>,
    );

    expect(getByTestId("resolved-dir")).toHaveTextContent("rtl");
  });

  test("falls back to ltr without a provider", () => {
    const { getByTestId } = render(<DirectionProbe />);

    expect(getByTestId("resolved-dir")).toHaveTextContent("ltr");
  });
});
