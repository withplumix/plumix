import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { EmbedFacade } from "./EmbedFacade.js";

afterEach(cleanup);

function renderFacade(overrides: Record<string, unknown> = {}) {
  return render(
    <EmbedFacade
      src="https://www.youtube-nocookie.com/embed/abc"
      title="Clip"
      caption=""
      provider="youtube"
      sandboxed={false}
      aspect="16 / 9"
      {...overrides}
    />,
  );
}

describe("EmbedFacade", () => {
  test("mounts the iframe only after the visitor clicks the facade", () => {
    const { container, getByTestId } = renderFacade();
    expect(container.querySelector("iframe")).toBeNull();

    fireEvent.click(getByTestId("embed-facade"));

    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/abc",
    );
    expect(iframe?.getAttribute("loading")).toBe("lazy");
  });

  test("strict-sandboxes an untrusted embed without same-origin", () => {
    const { container, getByTestId } = renderFacade({
      src: "https://example.com/widget",
      provider: "generic",
      sandboxed: true,
    });

    fireEvent.click(getByTestId("embed-facade"));

    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe?.getAttribute("sandbox")).not.toContain("allow-same-origin");
    // Untrusted host must not learn our origin.
    expect(iframe?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  test("does not sandbox a safelisted provider", () => {
    const { container, getByTestId } = renderFacade({ sandboxed: false });

    fireEvent.click(getByTestId("embed-facade"));

    const iframe = container.querySelector("iframe");
    expect(iframe?.hasAttribute("sandbox")).toBe(false);
    expect(iframe?.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });
});
