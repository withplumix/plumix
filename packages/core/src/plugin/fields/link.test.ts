import { describe, expect, expectTypeOf, test } from "vitest";

import type { LinkValue } from "./index.js";
import { decodeMetaBag, sanitizeMetaInput } from "../../rpc/meta/core.js";
import { link } from "./index.js";

describe("link field builder", () => {
  test("link(key) compiles to a link definition with a derived label", () => {
    const field = link("cta").build();
    expect(field.key).toBe("cta");
    expect(field.inputType).toBe("link");
    expect(field.type).toBe("json");
    expect(field.label).toBe("Cta");
  });

  test("universal chain carries every option into the definition", () => {
    const validate = (): true => true;
    const field = link("cta")
      .label("Call to action")
      .description("Where the button goes.")
      .placeholder("https://example.com")
      .default({ url: "/pricing", label: "Pricing" })
      .required()
      .span(6)
      .capability("marketing:manage")
      .showInApi()
      .validate(validate)
      .build();

    expect(field).toMatchObject({
      key: "cta",
      inputType: "link",
      type: "json",
      label: "Call to action",
      description: "Where the button goes.",
      placeholder: "https://example.com",
      default: { url: "/pricing", label: "Pricing" },
      required: true,
      span: 6,
      capability: "marketing:manage",
      showInApi: true,
    });
    expect(field.validate).toBe(validate);
  });

  test("chains are immutable — a shared base forks without aliasing", () => {
    const base = link("shared").span(6);
    const a = base.label("A").required();
    const b = base.label("B");

    expect(a).not.toBe(base);
    expect(a.build()).toMatchObject({ label: "A", span: 6, required: true });
    expect(b.build()).toMatchObject({ label: "B", span: 6 });
    expect(b.build().required).toBeUndefined();
    expect(base.build()).toMatchObject({ label: "Shared", span: 6 });
  });
});

describe("link server validation and round-trip", () => {
  const field = link("cta").build();
  const findField = (key: string) => (key === "cta" ? field : undefined);

  async function write(value: unknown): Promise<unknown> {
    const patch = await sanitizeMetaInput(findField, { cta: value });
    return patch?.upserts.get("cta");
  }

  test("a full link value round-trips through write and read", async () => {
    const value = { url: "https://example.com/x", label: "Go", newTab: true };
    const stored = await write(value);
    expect(stored).toEqual(value);
    expect(decodeMetaBag(findField, { cta: stored })).toEqual({ cta: value });
  });

  test("relative forms and safe non-http schemes are accepted", async () => {
    for (const url of [
      "/pricing",
      "#contact",
      "?page=2",
      "./sibling",
      "mailto:hi@example.com",
      "tel:+15551234567",
    ]) {
      expect(await write({ url })).toEqual({ url });
    }
  });

  test("malformed URLs, unsafe schemes, and bad shapes reject with a path-addressed error", async () => {
    for (const bad of [
      { url: "not a url" },
      { url: "" },
      // Script-bearing schemes must hard-fail — the url reaches
      // rendered anchor hrefs (same gate as richtext link marks).
      { url: "javascript:alert(1)" },
      { url: "JavaScript:alert(1)" },
      { url: "data:text/html,<script>x</script>" },
      { url: 42 },
      {},
      "https://example.com",
      ["https://example.com"],
      { url: "/x", label: 7 },
      { url: "/x", newTab: "yes" },
    ]) {
      await expect(
        sanitizeMetaInput(findField, { cta: bad }),
      ).rejects.toMatchObject({
        name: "MetaValidationError",
        errors: [{ path: "cta", message: { id: "metaField.invalid" } }],
      });
    }
  });

  test("unrecognized properties are stripped before persistence", async () => {
    expect(
      await write({ url: "/x", label: "Go", tracking: "utm_source=evil" }),
    ).toEqual({ url: "/x", label: "Go" });
  });

  test("a chained .sanitize() runs after the shape check on the typed value", async () => {
    const trimmed = link("cta")
      .sanitize((value) => ({ ...value, label: value.label?.trim() }))
      .build();
    const patch = await sanitizeMetaInput(
      (key) => (key === "cta" ? trimmed : undefined),
      { cta: { url: "/x", label: "  Go  " } },
    );
    expect(patch?.upserts.get("cta")).toEqual({ url: "/x", label: "Go" });
  });
});

describe("link registers and round-trips the manifest", () => {
  test("entry meta box ships the link wire shape without callbacks", async () => {
    const { HookRegistry } = await import("../../hooks/registry.js");
    const { definePlugin } = await import("../define.js");
    const { buildManifest } = await import("../manifest.js");
    const { installPlugins } = await import("../register.js");

    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerEntryType("post", { label: "Post" });
      ctx.registerEntryMetaBox("cta", {
        label: "CTA",
        entryTypes: ["post"],
        fields: [link("cta").placeholder("https://…").required()],
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);

    const wireField = manifest.entryMetaBoxes[0]?.fields[0];
    expect(wireField).toMatchObject({
      key: "cta",
      label: "Cta",
      type: "json",
      inputType: "link",
      placeholder: "https://…",
      required: true,
    });
    for (const value of Object.values(wireField ?? {})) {
      expect(typeof value).not.toBe("function");
    }
  });
});

describe("link phantom value typing", () => {
  test("unadorned reads `LinkValue | undefined`; .required()/.default() narrow", () => {
    const _unadorned = link("cta");
    expectTypeOf<(typeof _unadorned)["_key"]>().toEqualTypeOf<"cta">();
    expectTypeOf<(typeof _unadorned)["_value"]>().toEqualTypeOf<
      LinkValue | undefined
    >();

    const _required = link("cta").required();
    expectTypeOf<(typeof _required)["_value"]>().toEqualTypeOf<LinkValue>();

    const _defaulted = link("cta").default({ url: "/pricing" });
    expectTypeOf<(typeof _defaulted)["_value"]>().toEqualTypeOf<LinkValue>();

    // Narrowing survives later chained calls.
    const _chained = link("cta").required().span(6).label("CTA");
    expectTypeOf<(typeof _chained)["_value"]>().toEqualTypeOf<LinkValue>();
  });

  test("stored shape narrows on .required() but not .default()", () => {
    const _plain = link("cta");
    expectTypeOf<(typeof _plain)["_stored"]>().toEqualTypeOf<
      LinkValue | undefined
    >();

    // Storage can still lack the key — defaults apply at decode time.
    const _defaulted = link("cta").default({ url: "/pricing" });
    expectTypeOf<(typeof _defaulted)["_stored"]>().toEqualTypeOf<
      LinkValue | undefined
    >();

    const _required = link("cta").required();
    expectTypeOf<(typeof _required)["_stored"]>().toEqualTypeOf<LinkValue>();
  });

  test(".sanitize()/.validate() callbacks receive the narrowed value type", () => {
    link("cta").sanitize((value) => {
      expectTypeOf(value).toEqualTypeOf<LinkValue>();
      return value;
    });
    link("cta")
      .required()
      .validate((value) => {
        expectTypeOf(value).toEqualTypeOf<LinkValue>();
        return true;
      });
  });
});
