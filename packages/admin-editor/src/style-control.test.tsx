import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { ThemeTokens } from "@plumix/blocks";

import { StyleControl } from "./style-control.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});
afterEach(cleanup);

const tokens: ThemeTokens = {
  spacing: { lg: { value: "24px" }, sm: { value: "8px" } },
};

function renderControl(
  props: Partial<Parameters<typeof StyleControl>[0]> = {},
) {
  const onChange = vi.fn();
  const utils = render(
    <I18nProvider i18n={i18n}>
      <StyleControl
        label="Padding"
        property="padding"
        category="spacing"
        value={undefined}
        tokens={tokens}
        onChange={onChange}
        {...props}
      />
    </I18nProvider>,
  );
  return { ...utils, onChange };
}

describe("StyleControl", () => {
  test("token mode emits a token ref, and clears on the empty option", async () => {
    const user = userEvent.setup({ delay: null });
    // The spy doesn't feed the chosen value back as a prop, so each pick is
    // made from the same rendered `lg` value — choose targets that differ
    // from it (Radix skips onValueChange when the active item is re-picked).
    const { getByTestId, onChange } = renderControl({
      value: "var(--plumix-spacing-lg, 24px)",
    });

    await user.click(getByTestId("style-control-padding-token"));
    await user.click(getByTestId("style-control-padding-token-sm"));
    expect(onChange).toHaveBeenLastCalledWith("var(--plumix-spacing-sm, 8px)");

    await user.click(getByTestId("style-control-padding-token"));
    await user.click(getByTestId("style-control-padding-token-none"));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test("custom mode emits a raw value", () => {
    const { getByTestId, onChange } = renderControl();
    fireEvent.click(getByTestId("style-control-padding-mode-custom"));
    fireEvent.change(getByTestId("style-control-padding-custom"), {
      target: { value: "20px" },
    });
    expect(onChange).toHaveBeenCalledWith("20px");
  });

  test("a custom-only control (no category) offers no token mode", () => {
    const { getByTestId, queryByTestId } = renderControl({
      category: undefined,
    });
    expect(getByTestId("style-control-padding-custom")).toBeDefined();
    expect(queryByTestId("style-control-padding-token")).toBeNull();
  });
});
