import { createBlockRegistry } from "plumix/blocks";
import { PlumixProvider } from "plumix/blocks/renderer";
import { email, text } from "plumix/fields";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";

import type { FormDefinition } from "./define-form.js";
import { defineForm } from "./define-form.js";
import { createFormRegistry, publishFormRegistry } from "./registry.js";
import { formWire, PlumixForm } from "./theme.js";

const contact = defineForm("contact", {
  title: "Get in touch",
  fields: [text("name").required(), email("email")],
});

/** One install's registry, published the way `forms()` publishes its own. */
function install(...forms: readonly FormDefinition[]): void {
  const registry = createFormRegistry();
  for (const form of forms) registry.register(form, "config");
  publishFormRegistry(registry);
}

beforeEach(() => {
  install();
});

function renderTemplate(node: React.ReactNode, basePath = ""): string {
  return renderToStaticMarkup(
    <PlumixProvider
      value={{ registry: createBlockRegistry([]), mode: "live", basePath }}
    >
      {node}
    </PlumixProvider>,
  );
}

describe("<PlumixForm> in a theme template", () => {
  test("renders the form registered under the slug", () => {
    install(contact);

    const html = renderTemplate(<PlumixForm slug="contact" />);

    expect(html).toContain('data-plumix-form="contact"');
    expect(html).toContain('data-plumix-form-control="name"');
  });

  test("renders nothing when no form is registered under the slug", () => {
    expect(renderTemplate(<PlumixForm slug="ghost" />)).toBe("");
  });

  test("posts to the submit endpoint under the site's base path", () => {
    install(contact);

    const html = renderTemplate(<PlumixForm slug="contact" />, "/blog");

    expect(html).toContain('action="/blog/_plumix/forms/submit"');
  });

  test("keeps two renders of one form from sharing control ids", () => {
    install(contact);

    const html = renderTemplate(
      <>
        <PlumixForm slug="contact" id="header" />
        <PlumixForm slug="contact" id="footer" />
      </>,
    );

    expect(html).toContain('id="plumix-form-header-name"');
    expect(html).toContain('id="plumix-form-footer-name"');
  });
});

describe("formWire", () => {
  test("hands a theme the form's shape and nothing server-only", () => {
    install(contact);

    const wire = formWire("contact");

    expect(wire?.slug).toBe("contact");
    expect(wire?.fields.map((field) => field.key)).toEqual(["name", "email"]);
    expect(wire).not.toHaveProperty("onSubmit");
    expect(wire).not.toHaveProperty("validate");
  });

  test("is undefined for a slug nobody registered", () => {
    expect(formWire("ghost")).toBeUndefined();
  });
});

// The registry is module-scoped so a theme template can reach one at all;
// what that costs is that a second install replaces the first. Worth a
// test because it is the one guarantee this surface does not give.
describe("two installs in one process", () => {
  test("resolve against the one that booted last", () => {
    install(contact);
    install(defineForm("newsletter", { fields: [email("email")] }));

    expect(formWire("newsletter")?.slug).toBe("newsletter");
    expect(formWire("contact")).toBeUndefined();
  });
});

// Binding is minted by the block's loader, which a template render has
// no equivalent of — signing is asynchronous and the render is not. The
// form still submits; it just stores no entry, exactly as one on an
// archive does.
describe("a bound form in a template", () => {
  test("renders without the signed entry the block would carry", () => {
    install(defineForm("enquiry", { bind: "entry", fields: [email("email")] }));

    const html = renderTemplate(<PlumixForm slug="enquiry" />);

    expect(html).toContain('data-plumix-form="enquiry"');
    expect(html).not.toContain("__plumix_bound");
  });
});
