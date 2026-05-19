import type { BlockSpecV2 as BlockSpec } from "@plumix/blocks";
import { describe, expect, test } from "vitest";

import { blockSpecsToPuckComponents } from "./block-adapter.js";

const noopRender: BlockSpec["render"] = () => null;

describe("blockSpecsToPuckComponents", () => {
  test("keys components by spec.name and surfaces the spec title as label", () => {
    const components = blockSpecsToPuckComponents([
      { name: "core/heading", title: "Heading", render: noopRender },
      { name: "core/paragraph", title: "Paragraph", render: noopRender },
    ]);

    expect(Object.keys(components)).toEqual(["core/heading", "core/paragraph"]);
    expect(components["core/heading"]?.label).toBe("Heading");
    expect(components["core/paragraph"]?.label).toBe("Paragraph");
  });

  test("falls back to spec.name as label when title is absent", () => {
    const components = blockSpecsToPuckComponents([
      { name: "acme/widget", render: noopRender },
    ]);

    expect(components["acme/widget"]?.label).toBe("acme/widget");
  });

  test("translates inputs to Puck fields", () => {
    const components = blockSpecsToPuckComponents([
      {
        name: "core/heading",
        title: "Heading",
        inputs: [
          { name: "text", type: "text" },
          {
            name: "level",
            type: "select",
            options: [
              { label: "H1", value: 1 },
              { label: "H2", value: 2 },
            ],
          },
        ],
        render: noopRender,
      },
    ]);

    const fields = components["core/heading"]?.fields ?? {};
    expect(Object.keys(fields)).toEqual(["text", "level"]);
    expect(fields.text?.type).toBe("text");
    expect(fields.level?.type).toBe("select");
  });

  test("forwards defaults to Puck defaultProps", () => {
    const components = blockSpecsToPuckComponents([
      {
        name: "core/heading",
        title: "Heading",
        defaults: { level: 2, text: "" },
        render: noopRender,
      },
    ]);

    expect(components["core/heading"]?.defaultProps).toEqual({
      level: 2,
      text: "",
    });
  });

  test("the synthesized render bridges Puck props → Plumix BlockNodeRenderProps", () => {
    let receivedAttrs: Readonly<Record<string, unknown>> | undefined;
    const components = blockSpecsToPuckComponents([
      {
        name: "acme/probe",
        render: ({ attrs }) => {
          receivedAttrs = attrs;
          return null;
        },
      },
    ]);

    components["acme/probe"]?.render({ text: "Hi" } as never);

    expect(receivedAttrs).toEqual({ text: "Hi" });
  });
});
