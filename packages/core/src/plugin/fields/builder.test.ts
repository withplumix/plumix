import { describe, expect, expectTypeOf, test } from "vitest";

import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../define.js";
import { buildManifest } from "../manifest.js";
import { installPlugins } from "../register.js";
import { email, password, text, textarea, url } from "./index.js";

describe("string field builder chassis", () => {
  test("text(key) compiles to a text field definition with a derived label", () => {
    const field = text("subtitle").build();
    expect(field.key).toBe("subtitle");
    expect(field.inputType).toBe("text");
    expect(field.type).toBe("string");
    expect(field.label).toBe("Subtitle");
  });

  test("derived labels humanize camelCase, snake_case, and kebab-case keys", () => {
    expect(text("heroImage").build().label).toBe("Hero image");
    expect(text("site_title").build().label).toBe("Site title");
    expect(text("og-description").build().label).toBe("Og description");
  });

  test("universal chain carries every option into the definition", () => {
    const sanitize = (value: string): string => value.trim();
    const validate = (value: string): true => {
      void value;
      return true;
    };
    const field = text("subtitle")
      .label("Subtitle line")
      .description("Shown under the title.")
      .placeholder("A short kicker")
      .prepend("https://")
      .append(".example.com")
      .default("none")
      .required()
      .span(6)
      .capability("seo:manage")
      .showInApi()
      .maxLength(120)
      .sanitize(sanitize)
      .validate(validate)
      .build();

    expect(field).toMatchObject({
      key: "subtitle",
      inputType: "text",
      type: "string",
      label: "Subtitle line",
      description: "Shown under the title.",
      placeholder: "A short kicker",
      prepend: "https://",
      append: ".example.com",
      default: "none",
      required: true,
      span: 6,
      capability: "seo:manage",
      showInApi: true,
      maxLength: 120,
    });
    expect(field.sanitize).toBe(sanitize);
    expect(field.validate).toBe(validate);
  });

  test(".label() accepts a message descriptor and keeps identity", () => {
    const descriptor = { id: "field.subtitle.label", message: "Subtitle" };
    expect(text("subtitle").label(descriptor).build().label).toBe(descriptor);
  });

  test("all five string constructors pin their inputType and share the chain", () => {
    expect(textarea("bio").build()).toMatchObject({
      key: "bio",
      inputType: "textarea",
      type: "string",
      label: "Bio",
    });
    expect(
      email("contact").placeholder("you@example.com").build(),
    ).toMatchObject({
      inputType: "email",
      type: "string",
      placeholder: "you@example.com",
    });
    expect(url("website").build()).toMatchObject({
      inputType: "url",
      type: "string",
    });
    expect(password("pin").maxLength(32).required().build()).toMatchObject({
      inputType: "password",
      type: "string",
      maxLength: 32,
      required: true,
    });
  });

  test("chains are immutable — a shared base forks without aliasing", () => {
    const base = text("shared").maxLength(50);
    const a = base.label("A").required();
    const b = base.label("B");

    expect(a).not.toBe(base);
    expect(a.build()).toMatchObject({
      label: "A",
      maxLength: 50,
      required: true,
    });
    expect(b.build()).toMatchObject({ label: "B", maxLength: 50 });
    expect(b.build().required).toBeUndefined();
    expect(base.build()).toMatchObject({ label: "Shared", maxLength: 50 });
    expect(base.build().required).toBeUndefined();
  });
});

describe("phantom value typing", () => {
  test("unadorned fields read as `string | undefined`; .required()/.default() narrow", () => {
    const _unadorned = text("subtitle");
    expectTypeOf<(typeof _unadorned)["_value"]>().toEqualTypeOf<
      string | undefined
    >();

    const _required = text("subtitle").required();
    expectTypeOf<(typeof _required)["_value"]>().toEqualTypeOf<string>();

    const _defaulted = text("subtitle").default("none");
    expectTypeOf<(typeof _defaulted)["_value"]>().toEqualTypeOf<string>();

    // Narrowing survives later chained calls.
    const _chained = text("subtitle").required().maxLength(10).label("S");
    expectTypeOf<(typeof _chained)["_value"]>().toEqualTypeOf<string>();
  });

  test(".sanitize()/.validate() callbacks receive the narrowed value type", () => {
    text("subtitle").sanitize((value) => {
      expectTypeOf(value).toEqualTypeOf<string>();
      return value;
    });
    text("subtitle")
      .required()
      .validate((value) => {
        expectTypeOf(value).toEqualTypeOf<string>();
        return true;
      });
  });
});

describe("fluent fields register and round-trip the manifest", () => {
  test("settings group: builder registers and ships the compiled wire shape", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("identity", {
        label: "Site identity",
        fields: [
          text("siteTitle")
            .placeholder("My site")
            .prepend("« ")
            .append(" »")
            .maxLength(60)
            .span(6)
            .sanitize((value) => value.trim())
            .validate(() => true),
        ],
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const manifest = buildManifest(registry);

    const field = manifest.settingsGroups[0]?.fields[0];
    expect(field).toMatchObject({
      key: "siteTitle",
      label: "Site title",
      type: "string",
      inputType: "text",
      placeholder: "My site",
      prepend: "« ",
      append: " »",
      maxLength: 60,
      span: 6,
    });
    // Server-only callbacks never reach the wire.
    for (const value of Object.values(field ?? {})) {
      expect(typeof value).not.toBe("function");
    }
  });

  test("entry meta box: .span() is accepted as a hint and stripped from the entry wire", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerEntryType("post", { label: "Post" });
      ctx.registerEntryMetaBox("seo", {
        label: "SEO",
        entryTypes: ["post"],
        fields: [text("metaTitle").span(6).required()],
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    // The registered (server-side) shape keeps the hint…
    const registered = registry.entryMetaBoxes.get("seo");
    expect(registered?.fields[0]).toMatchObject({
      key: "metaTitle",
      span: 6,
      required: true,
    });

    // …while the entry wire projection ignores it, as before.
    const manifest = buildManifest(registry);
    const wireField = manifest.entryMetaBoxes[0]?.fields[0];
    expect(wireField).toMatchObject({ key: "metaTitle", required: true });
    expect(wireField).not.toHaveProperty("span", 6);
  });

  test("registration-time key validation applies to compiled builders", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("broken", {
        label: "Broken",
        fields: [text("bad key")],
      });
    });

    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /must match/,
    );
  });
});
