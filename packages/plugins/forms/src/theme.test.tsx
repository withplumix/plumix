import type { EntryData } from "plumix";
import type { ReactNode } from "react";
import { email, text } from "plumix/fields";
import { describe, expect, test } from "vitest";

import type { FormWire } from "./define-form.js";
import { defineForm } from "./define-form.js";
import { forms } from "./index.js";
import { createFormsHarness } from "./test/harness.js";
import { formWire, PlumixForm } from "./theme.js";

const contact = defineForm("contact", {
  title: "Get in touch",
  fields: [text("name").required(), email("email")],
});

const newsletter = defineForm("newsletter", { fields: [email("email")] });

/**
 * A site whose theme renders `template` on an entry's page, booted now,
 * and a visit to that page.
 */
async function templatedSite(
  plugin: ReturnType<typeof forms>,
  template: (data: EntryData) => ReactNode,
  basePath = "",
): Promise<() => Promise<string>> {
  const harness = await createFormsHarness([plugin], {
    entryTemplate: template,
    basePath,
  });
  const author = await harness.seedUser("admin");
  await harness.factory.entry.create({
    type: "post",
    slug: "templated",
    title: "Templated",
    content: null,
    status: "published",
    authorId: author.id,
    publishedAt: new Date(),
  });
  return async () => {
    const response = await harness.fetch(`${basePath}/posts/templated`);
    response.assertStatus(200);
    return response.text();
  };
}

async function renderTemplate(
  plugin: ReturnType<typeof forms>,
  template: (data: EntryData) => ReactNode,
  basePath?: string,
): Promise<string> {
  const visit = await templatedSite(plugin, template, basePath);
  return visit();
}

describe("<PlumixForm> in a theme template", () => {
  test("renders the form registered under the slug", async () => {
    const html = await renderTemplate(forms({ forms: [contact] }), () => (
      <PlumixForm slug="contact" />
    ));

    expect(html).toContain('data-plumix-form="contact"');
    expect(html).toContain('data-plumix-form-control="name"');
  });

  test("renders nothing when no form is registered under the slug", async () => {
    const html = await renderTemplate(forms({ forms: [contact] }), () => (
      <PlumixForm slug="ghost" />
    ));

    expect(html).not.toContain("data-plumix-form");
  });

  test("posts to the submit endpoint under the site's base path", async () => {
    const html = await renderTemplate(
      forms({ forms: [contact] }),
      () => <PlumixForm slug="contact" />,
      "/blog",
    );

    expect(html).toContain('action="/blog/_plumix/forms/submit"');
  });

  test("keeps two renders of one form from sharing control ids", async () => {
    const html = await renderTemplate(forms({ forms: [contact] }), () => (
      <>
        <PlumixForm slug="contact" id="header" />
        <PlumixForm slug="contact" id="footer" />
      </>
    ));

    expect(html).toContain('id="plumix-form-header-name"');
    expect(html).toContain('id="plumix-form-footer-name"');
  });
});

describe("formWire", () => {
  test("hands a theme the form's shape and nothing server-only", async () => {
    let wire: FormWire | undefined;
    await renderTemplate(forms({ forms: [contact] }), () => {
      wire = formWire("contact");
      return null;
    });

    expect(wire?.slug).toBe("contact");
    expect(wire?.fields.map((field) => field.key)).toEqual(["name", "email"]);
    expect(wire).not.toHaveProperty("onSubmit");
    expect(wire).not.toHaveProperty("validate");
  });

  test("is undefined for a slug nobody registered", async () => {
    let wire: FormWire | undefined;
    let rendered = false;
    await renderTemplate(forms({ forms: [contact] }), () => {
      wire = formWire("ghost");
      rendered = true;
      return null;
    });

    expect(rendered).toBe(true);
    expect(wire).toBeUndefined();
  });
});

describe("two installs in one process", () => {
  test("each renders its own forms", async () => {
    const visitFirst = await templatedSite(forms({ forms: [contact] }), () => (
      <>
        <PlumixForm slug="contact" />
        <PlumixForm slug="newsletter" />
      </>
    ));
    await createFormsHarness([forms({ forms: [newsletter] })]);

    const html = await visitFirst();

    expect(html).toContain('data-plumix-form="contact"');
    expect(html).not.toContain('data-plumix-form="newsletter"');
  });
});

// Binding is minted by the block's loader, which a template render has
// no equivalent of — signing is asynchronous and the render is not. The
// form still submits; it just stores no entry, exactly as one on an
// archive does.
describe("a bound form in a template", () => {
  test("renders without the signed entry the block would carry", async () => {
    const enquiry = defineForm("enquiry", {
      bind: "entry",
      fields: [email("email")],
    });

    const html = await renderTemplate(forms({ forms: [enquiry] }), () => (
      <PlumixForm slug="enquiry" />
    ));

    expect(html).toContain('data-plumix-form="enquiry"');
    expect(html).not.toContain("__plumix_bound");
  });
});
