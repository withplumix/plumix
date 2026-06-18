import { cleanup, render } from "@testing-library/react";
import { Direction } from "radix-ui";
import { afterEach, describe, expect, test } from "vitest";

// Regression guard for the RTL direction-context bug. The admin shell mounts
// `Direction.DirectionProvider` (App.tsx); every shadcn/radix primitive
// behind it reads direction via `Direction.useDirection` — the exact hook
// probed here. Both MUST come from the same `@radix-ui/react-direction`
// instance, which is why App imports `Direction` from the `radix-ui`
// umbrella (the version the primitives are built against) rather than the
// standalone `@radix-ui/react-direction` package. When those diverged, the
// provider produced a context the primitives never read and RTL fell back to
// LTR for the `ar` locale. If a future radix bump re-splits the umbrella's
// provider from its `useDirection`, this fails.
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
