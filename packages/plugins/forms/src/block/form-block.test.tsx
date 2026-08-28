import type { EntryContent } from "plumix/blocks";
import { createBlockRegistry } from "plumix/blocks";
import { BlockRenderer, PlumixProvider } from "plumix/blocks/renderer";
import { email, text } from "plumix/fields";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { defineForm } from "../define-form.js";
import { createFormRegistry } from "../registry.js";
import { createFormBlock } from "./form-block.js";

const contact = defineForm("contact", {
  fields: [text("name").required(), email("email")],
});

function registryWithContact() {
  const formRegistry = createFormRegistry();
  formRegistry.register(contact, "config");
  return formRegistry;
}

function render(slug: string, mode: "edit" | "live"): string {
  const block = createFormBlock(registryWithContact());
  const content: EntryContent = {
    version: "plumix.v2",
    blocks: [{ id: "n", name: block.name, attrs: { slug } }],
  };
  return renderToStaticMarkup(
    <PlumixProvider value={{ registry: createBlockRegistry([block]), mode }}>
      <BlockRenderer content={content} />
    </PlumixProvider>,
  );
}

describe("the form block's slug", () => {
  test("says so in the editor when nothing is registered under it", () => {
    const html = render("ghost", "edit");

    expect(html).toContain('data-plumix-form-missing="ghost"');
  });

  test("renders nothing on a live page when nothing is registered under it", () => {
    expect(render("ghost", "live")).not.toContain("plumix-form");
  });
});

describe("the form block's markup", () => {
  test("carries a required attribute only where the field declared one", () => {
    const html = render("contact", "live");

    expect(html).toMatch(/data-plumix-form-control="name"[^>]*required/);
    expect(html).not.toMatch(/data-plumix-form-control="email"[^>]*required/);
  });

  test("keeps the honeypot out of the accessibility tree", () => {
    const html = render("contact", "live");

    expect(html).toMatch(/data-plumix-form-honeypot[^>]*aria-hidden="true"/);
  });

  test("gives every control a label that points at it", () => {
    const html = render("contact", "live");

    expect(html).toContain('for="plumix-form-n-name"');
    expect(html).toContain('id="plumix-form-n-name"');
  });

  test("offers the registered forms as the block's picker options", () => {
    const formRegistry = registryWithContact();
    const block = createFormBlock(formRegistry);
    formRegistry.register(
      defineForm("newsletter", {
        title: "Newsletter",
        fields: [email("email")],
      }),
      "newsletter",
    );

    expect(block.inputs?.[0]?.options).toEqual([
      { value: "contact", label: "contact" },
      { value: "newsletter", label: "Newsletter" },
    ]);
  });
});
