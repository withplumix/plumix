import type { Mark, Node } from "@tiptap/core";
import type { ComponentType } from "react";
import { describe, expect, test } from "vitest";

import {
  buildPluginBlockContributions,
  buildPluginMarkContributions,
} from "./plugin-contributions.js";

const stubBlockSchema = { name: "acme/callout" } as unknown as Node;
const stubMarkSchema = { name: "acme/highlight" } as unknown as Mark;
const StubEditor: ComponentType<unknown> = () => null;

describe("buildPluginBlockContributions", () => {
  test("wraps a manifest entry with a registered schema into a PluginContribution", async () => {
    const contributions = buildPluginBlockContributions(
      [
        {
          name: "acme/callout",
          title: "Callout",
          adminSchema: "calloutSchema",
        },
      ],
      {
        getBlockSchema: (name) =>
          name === "acme/callout" ? stubBlockSchema : undefined,
        getBlockEditor: () => undefined,
      },
    );

    expect(contributions).toHaveLength(1);
    const entry = contributions[0]!;
    expect(entry.pluginId).toBe("manifest");
    expect(entry.spec.name).toBe("acme/callout");
    expect(entry.spec.title).toBe("Callout");
    await expect(entry.spec.schema()).resolves.toBe(stubBlockSchema);
    expect(entry.spec.editor).toBeUndefined();
  });

  test("attaches the admin editor when both manifest ref + registry entry present", async () => {
    const contributions = buildPluginBlockContributions(
      [
        {
          name: "acme/callout",
          title: "Callout",
          adminSchema: "calloutSchema",
          adminEditor: "CalloutEditor",
        },
      ],
      {
        getBlockSchema: () => stubBlockSchema,
        getBlockEditor: (name) =>
          name === "acme/callout" ? StubEditor : undefined,
      },
    );

    const entry = contributions[0]!;
    expect(entry.spec.editor).toBeDefined();
    await expect(entry.spec.editor!()).resolves.toBe(StubEditor);
  });

  test("skips entries without an admin schema ref", () => {
    const contributions = buildPluginBlockContributions(
      [{ name: "acme/no-schema", title: "Metadata only" }],
      {
        getBlockSchema: () => stubBlockSchema,
        getBlockEditor: () => undefined,
      },
    );

    expect(contributions).toEqual([]);
  });

  test("skips entries where the runtime registry has no schema", () => {
    const contributions = buildPluginBlockContributions(
      [
        {
          name: "acme/callout",
          title: "Callout",
          adminSchema: "calloutSchema",
        },
      ],
      {
        getBlockSchema: () => undefined,
        getBlockEditor: () => undefined,
      },
    );

    expect(contributions).toEqual([]);
  });

  test("forwards declarative metadata onto the synthetic BlockSpec", () => {
    const contributions = buildPluginBlockContributions(
      [
        {
          name: "acme/callout",
          title: "Callout",
          description: "Aside content",
          keywords: ["aside", "note"],
          category: "interactive",
          icon: "lightbulb",
          adminSchema: "calloutSchema",
          attributes: {
            variant: {
              type: "select",
              options: [{ value: "info", label: "Info" }],
            },
          },
        },
      ],
      {
        getBlockSchema: () => stubBlockSchema,
        getBlockEditor: () => undefined,
      },
    );

    expect(contributions[0]!.spec).toMatchObject({
      name: "acme/callout",
      title: "Callout",
      description: "Aside content",
      keywords: ["aside", "note"],
      category: "interactive",
      icon: "lightbulb",
      attributes: {
        variant: {
          type: "select",
          options: [{ value: "info", label: "Info" }],
        },
      },
    });
  });
});

describe("buildPluginMarkContributions", () => {
  test("wraps a manifest entry with a registered schema", async () => {
    const contributions = buildPluginMarkContributions(
      [
        {
          name: "acme/highlight",
          title: "Highlight",
          adminSchema: "highlightSchema",
        },
      ],
      {
        getMarkSchema: (name) =>
          name === "acme/highlight" ? stubMarkSchema : undefined,
      },
    );

    expect(contributions).toHaveLength(1);
    const entry = contributions[0]!;
    expect(entry.spec.name).toBe("acme/highlight");
    expect(entry.spec.title).toBe("Highlight");
    await expect(entry.spec.schema()).resolves.toBe(stubMarkSchema);
  });

  test("skips entries without an admin schema ref or runtime registration", () => {
    const contributions = buildPluginMarkContributions(
      [
        { name: "acme/no-schema", title: "Metadata only" },
        {
          name: "acme/highlight",
          title: "Highlight",
          adminSchema: "highlightSchema",
        },
      ],
      {
        getMarkSchema: () => undefined,
      },
    );

    expect(contributions).toEqual([]);
  });
});
