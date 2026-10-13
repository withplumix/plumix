import type { ReactElement } from "react";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "@plumix/core/blocks";

import { CanvasFrame } from "./canvas-frame.js";
import { EditorConfigProvider } from "./editor-config-context.js";
import { EditorProvider } from "./provider.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
const registry = createBlockRegistry([]);

function frame(readOnly: boolean): ReactElement {
  return (
    <I18nProvider i18n={i18n}>
      <EditorConfigProvider
        registry={registry}
        tokens={{}}
        capabilities={new Set()}
      >
        <EditorProvider registry={registry}>
          <CanvasFrame
            previewUrl="about:blank"
            origin="http://localhost:3000"
            readOnly={readOnly}
          />
        </EditorProvider>
      </EditorConfigProvider>
    </I18nProvider>
  );
}

describe("CanvasFrame", () => {
  test("shows the frame handle while editing", () => {
    expect(renderToStaticMarkup(frame(false))).toContain(
      'data-testid="plumix-canvas-handle"',
    );
  });

  test("hides the frame handle in read-only preview", () => {
    expect(renderToStaticMarkup(frame(true))).not.toContain(
      'data-testid="plumix-canvas-handle"',
    );
  });
});
