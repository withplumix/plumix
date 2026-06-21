import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
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
  test("token mode emits a token ref, and clears on the empty option", () => {
    const { getByTestId, onChange } = renderControl();
    const select = getByTestId(
      "style-control-padding-token",
    ) as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "lg" } });
    expect(onChange).toHaveBeenCalledWith({ token: "lg" });

    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test("custom mode emits a raw value", () => {
    const { getByTestId, onChange } = renderControl();
    fireEvent.click(getByTestId("style-control-padding-mode-custom"));
    fireEvent.change(getByTestId("style-control-padding-custom"), {
      target: { value: "20px" },
    });
    expect(onChange).toHaveBeenCalledWith({ raw: "20px" });
  });

  test("a custom-only control (no category) offers no token mode", () => {
    const { getByTestId, queryByTestId } = renderControl({
      category: undefined,
    });
    expect(getByTestId("style-control-padding-custom")).toBeDefined();
    expect(queryByTestId("style-control-padding-token")).toBeNull();
  });
});
