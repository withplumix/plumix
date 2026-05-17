import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, test, vi } from "vitest";

import type { BlockRegistry, ResolvedBlockSpec } from "@plumix/blocks";

import { runAxeSmokeTest } from "./a11y-smoke-helpers.js";
import { Inspector } from "./inspector/Inspector.js";
import { SlashMenuPanel } from "./slash-menu/SlashMenuPanel.js";

afterEach(() => {
  cleanup();
});

function spec(
  partial: Partial<ResolvedBlockSpec> & { name: string; title: string },
): ResolvedBlockSpec {
  return {
    name: partial.name,
    title: partial.title,
    description: partial.description,
    category: partial.category ?? "typography",
    attributes: partial.attributes,
    supports: partial.supports,
    component: () => null,
    legacyAliases: undefined,
    schema: undefined,
    registeredBy: null,
    editor: undefined,
    client: undefined,
  } as unknown as ResolvedBlockSpec;
}

function fakeBlockRegistry(specs: readonly ResolvedBlockSpec[]): BlockRegistry {
  const map = new Map(specs.map((s) => [s.name, s]));
  return {
    get: (n) => map.get(n),
    has: (n) => map.has(n),
    size: map.size,
    [Symbol.iterator]: () => map.entries(),
  } satisfies BlockRegistry;
}

function stubEditor(nodeType: string, attrs: Record<string, unknown>) {
  const chain = {
    focus: () => chain,
    updateAttributes: () => chain,
    run: () => true,
  };
  return {
    chain: () => chain,
    on: () => undefined,
    off: () => undefined,
    state: {
      selection: {
        $from: { parent: { type: { name: nodeType }, attrs } },
      },
    },
  } as unknown as Parameters<typeof Inspector>[0]["editor"];
}

describe("editor surface a11y smoke", () => {
  test("Inspector with attributes + supports passes axe baseline", async () => {
    const sectionSpec = spec({
      name: "core/section",
      title: "Section",
      attributes: {
        level: {
          type: "select",
          label: "Level",
          default: 2,
          options: [
            { value: 1, label: "H1" },
            { value: 2, label: "H2" },
          ],
        },
      },
      supports: { anchor: true, color: { background: true } },
    });
    const registry = fakeBlockRegistry([sectionSpec]);
    const editor = stubEditor("core/section", { level: 2, style: {} });
    const { container } = render(
      <Inspector editor={editor} blockRegistry={registry} />,
    );
    await runAxeSmokeTest(container);
  });

  test("SlashMenuPanel passes axe baseline", async () => {
    const { container } = render(
      <SlashMenuPanel
        items={[
          {
            name: "core/paragraph",
            title: "Paragraph",
            category: "typography",
          },
          { name: "core/heading", title: "Heading", category: "typography" },
        ]}
        query=""
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    await runAxeSmokeTest(container);
  });
});
