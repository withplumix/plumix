// Covers the pair `plumix/fields` publishes — `compileMetaBoxFields` (in
// `meta-box-field.ts`) and `toMetaBoxFieldEntry` — as one contract, since a
// caller always runs them together.

import { describe, expect, test } from "vitest";

import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../define.js";
import { buildManifest } from "../manifest.js";
import { installPlugins } from "../register.js";
import {
  compileMetaBoxFields,
  group,
  number,
  repeater,
  text,
  toMetaBoxFieldEntry,
} from "./index.js";

describe("compileMetaBoxFields()", () => {
  test("compiles a mix of fluent builders and plain definitions", () => {
    expect(
      compileMetaBoxFields([
        text("subtitle").maxLength(120),
        { key: "legacy", label: "Legacy", type: "string", inputType: "text" },
      ]),
    ).toEqual([
      {
        key: "subtitle",
        label: "Subtitle",
        type: "string",
        inputType: "text",
        maxLength: 120,
      },
      { key: "legacy", label: "Legacy", type: "string", inputType: "text" },
    ]);
  });
});

describe("toMetaBoxFieldEntry()", () => {
  test("projects a compiled definition to its wire-shaped entry", () => {
    const [entry] = compileMetaBoxFields([
      text("subtitle").description("Shown under the title").maxLength(120),
    ]).map(toMetaBoxFieldEntry);

    expect(entry).toEqual({
      key: "subtitle",
      label: "Subtitle",
      type: "string",
      inputType: "text",
      description: "Shown under the title",
      maxLength: 120,
    });
  });

  test("strips callback-valued properties from the wire shape", () => {
    const definitions = compileMetaBoxFields([
      text("slug")
        .sanitize((value) => value.trim())
        .validate((value) => value.length > 0 || "Required"),
    ]);
    expect(definitions[0]).toHaveProperty("sanitize");
    expect(definitions[0]).toHaveProperty("validate");

    const [entry] = definitions.map(toMetaBoxFieldEntry);
    expect(entry).not.toHaveProperty("sanitize");
    expect(entry).not.toHaveProperty("validate");
  });

  test("projects repeater rows and group members recursively", () => {
    const [rows, address] = compileMetaBoxFields([
      repeater("rows").fields([text("q").span(6), number("weight")]),
      group("address").fields([text("city"), text("zip")]),
    ]).map(toMetaBoxFieldEntry);

    expect(rows?.subFields).toEqual([
      { key: "q", label: "Q", type: "string", inputType: "text", span: 6 },
      { key: "weight", label: "Weight", type: "number", inputType: "number" },
    ]);
    expect(address?.subFields).toEqual([
      { key: "city", label: "City", type: "string", inputType: "text" },
      { key: "zip", label: "Zip", type: "string", inputType: "text" },
    ]);
  });

  test("matches the field entries the admin already receives", async () => {
    const fields = [
      text("headline").required(),
      repeater("rows").fields([text("q").span(6), number("weight")]),
      group("address").fields([text("city"), text("zip")]),
    ];
    const hooks = new HookRegistry();
    const plugin = definePlugin("forms", (ctx) => {
      ctx.registerUserMetaBox("profile", { label: "Profile", fields });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    const [box] = buildManifest(registry).userMetaBoxes;
    expect(box?.fields).toEqual(
      compileMetaBoxFields(fields).map(toMetaBoxFieldEntry),
    );
  });
});
