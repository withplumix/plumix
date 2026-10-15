import type { ReactElement } from "react";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockInput, JsonValue } from "@plumix/core/blocks";

import type {
  PluginFieldControlProps,
  ResolvePluginFieldType,
} from "./block-input-control.js";
import { BlockInputControl } from "./block-input-control.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

function markup(
  input: BlockInput,
  value: JsonValue | undefined,
  extra: {
    readonly resolvePluginFieldType?: ResolvePluginFieldType;
    readonly attrs?: Readonly<Record<string, JsonValue>>;
  } = {},
): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={i18n}>
      <BlockInputControl
        input={input}
        value={value}
        onChange={() => undefined}
        {...extra}
      />
    </I18nProvider>,
  );
}

function StubField({
  testId,
  rhf,
  attrs,
}: PluginFieldControlProps): ReactElement {
  return (
    <span
      data-testid={testId}
      data-plugin="stub"
      data-value={JSON.stringify(rhf.value)}
      data-src={JSON.stringify(attrs?.src)}
    />
  );
}

describe("BlockInputControl", () => {
  test("falls back to a text input for an unknown kind", () => {
    expect(markup({ name: "mystery", type: "future-kind" }, "x")).toMatch(
      /<input[^>]*data-testid="block-input-mystery"[^>]*value="x"/,
    );
  });

  test("renders a host-resolved plugin field for an unknown kind, handing it the value", () => {
    const html = markup({ name: "image", type: "media" }, "seed", {
      resolvePluginFieldType: (type) =>
        type === "media" ? StubField : undefined,
    });

    expect(html).toContain(
      'data-testid="block-input-image" data-plugin="stub" data-value="&quot;seed&quot;"',
    );
  });

  test("forwards the block's sibling attrs to a plugin control", () => {
    const html = markup(
      { name: "focalPoint", type: "focalPoint" },
      { x: 0.5, y: 0.5 },
      {
        attrs: { src: "/photo.jpg", alt: "x" },
        resolvePluginFieldType: (type) =>
          type === "focalPoint" ? StubField : undefined,
      },
    );

    expect(html).toContain('data-src="&quot;/photo.jpg&quot;"');
  });

  test("still falls back to text when no resolver matches the unknown kind", () => {
    const html = markup({ name: "mystery", type: "future-kind" }, "x", {
      resolvePluginFieldType: () => undefined,
    });

    expect(html).toMatch(
      /<input[^>]*data-testid="block-input-mystery"[^>]*value="x"/,
    );
  });

  test("uses the input name as the label when none is given", () => {
    expect(markup({ name: "slug", type: "text" }, "")).toMatch(
      /data-testid="block-input-slug-label"[^>]*>slug</,
    );
  });
});
