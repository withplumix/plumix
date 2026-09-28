import type { ReactElement } from "react";
import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { BlockRegistry } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import type { EditorConfig } from "./editor-config-context.js";
import {
  EditorConfigProvider,
  useEditorConfig,
} from "./editor-config-context.js";

afterEach(cleanup);

const registry: BlockRegistry = createBlockRegistry([
  { name: "core/heading", render: () => null },
]);

function ConfigProbe(): ReactElement {
  const config = useEditorConfig();
  return (
    <output data-testid="config-probe">
      {[
        registry === config.registry ? "registry" : "",
        config.tokens.spacing?.sm?.value ?? "",
        config.capabilities.has("edit") ? "edit" : "",
        config.resolvePluginFieldType?.("mediaUrl") ? "resolver" : "",
      ].join(":")}
    </output>
  );
}

describe("useEditorConfig", () => {
  test("throws when used outside a provider", () => {
    expect(() => render(<ConfigProbe />)).toThrow(/EditorConfigProvider/);
  });

  test("exposes the session-stable config to descendants", () => {
    const { getByTestId } = render(
      <EditorConfigProvider
        registry={registry}
        tokens={{ spacing: { sm: { value: "8px" } } }}
        capabilities={new Set(["edit"])}
        resolvePluginFieldType={() => () => null}
      >
        <ConfigProbe />
      </EditorConfigProvider>,
    );
    expect(getByTestId("config-probe").textContent).toBe(
      "registry:8px:edit:resolver",
    );
  });

  test("keeps the config identity stable across re-renders with equal inputs", () => {
    // The "session-stable" promise rests on the provider's memo: equal inputs
    // must yield the same object, so a parent re-render doesn't cascade into
    // every panel. (Guards the NO_TOKENS default in PlumixEditor, whose job is
    // to keep the `tokens` input referentially stable.)
    const seen: EditorConfig[] = [];
    function Capture(): null {
      seen.push(useEditorConfig());
      return null;
    }
    // Stable references across every Parent render — the identity the memo keys
    // on. A fresh literal here (as `tokens ?? {}` once produced) would break it.
    const caps: ReadonlySet<string> = new Set();
    const toks = { spacing: { sm: { value: "8px" } } };
    function Parent(): ReactElement {
      const [, bump] = useState(0);
      return (
        <>
          <button
            type="button"
            data-testid="bump"
            onClick={() => bump((n) => n + 1)}
          />
          <EditorConfigProvider
            registry={registry}
            tokens={toks}
            capabilities={caps}
          >
            <Capture />
          </EditorConfigProvider>
        </>
      );
    }
    const { getByTestId } = render(<Parent />);
    const before = seen.length;
    fireEvent.click(getByTestId("bump"));
    expect(seen.length).toBeGreaterThan(before);
    expect(seen[0]).toBe(seen.at(-1));
  });
});
