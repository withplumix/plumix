import type { EntryContent } from "plumix/blocks";
import { createBlockRegistry } from "plumix/blocks";
import { BlockRenderer, PlumixProvider } from "plumix/blocks/renderer";
import {
  date,
  email,
  number,
  select,
  text,
  textarea,
  toggle,
  url,
} from "plumix/fields";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { FormDefinition } from "../define-form.js";
import { defineForm } from "../define-form.js";
import { tel } from "../fields.js";
import { createFormRegistry } from "../registry.js";
import { createFormBlock } from "./form-block.js";

const contact = defineForm("contact", {
  fields: [text("name").required(), email("email")],
});

function registryWith(form: FormDefinition) {
  const formRegistry = createFormRegistry();
  formRegistry.register(form, "config");
  return formRegistry;
}

function renderForm(form: FormDefinition): string {
  return render(form.slug, "live", registryWith(form));
}

function render(
  slug: string,
  mode: "edit" | "live",
  formRegistry = registryWith(contact),
): string {
  const block = createFormBlock(formRegistry);
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
    const formRegistry = registryWith(contact);
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

describe("the control a field renders", () => {
  test("gives each string-shaped field its own native input type", () => {
    const html = renderForm(
      defineForm("roster", {
        fields: [text("name"), email("email"), url("website"), tel("phone")],
      }),
    );

    expect(html).toMatch(/data-plumix-form-control="name"[^>]*type="text"/);
    expect(html).toMatch(/data-plumix-form-control="email"[^>]*type="email"/);
    expect(html).toMatch(/data-plumix-form-control="website"[^>]*type="url"/);
    expect(html).toMatch(/data-plumix-form-control="phone"[^>]*type="tel"/);
  });

  test("carries a number field's bounds onto its input", () => {
    const html = renderForm(
      defineForm("booking", {
        fields: [number("guests").min(1).max(8)],
      }),
    );

    expect(html).toMatch(/data-plumix-form-control="guests"[^>]*type="number"/);
    expect(html).toMatch(/data-plumix-form-control="guests"[^>]*min="1"/);
    expect(html).toMatch(/data-plumix-form-control="guests"[^>]*max="8"/);
  });

  test("renders a date field as a date input", () => {
    const html = renderForm(
      defineForm("booking", { fields: [date("visitOn")] }),
    );

    expect(html).toMatch(/data-plumix-form-control="visitOn"[^>]*type="date"/);
  });

  test("renders a textarea rather than an input for a long answer", () => {
    const html = renderForm(
      defineForm("feedback", { fields: [textarea("message")] }),
    );

    expect(html).toMatch(/<textarea[^>]*data-plumix-form-control="message"/);
  });

  test("renders a select with an option per choice, plus a blank one", () => {
    const html = renderForm(
      defineForm("signup", {
        fields: [select("plan").options(["basic", "pro"])],
      }),
    );

    expect(html).toMatch(/<select[^>]*data-plumix-form-control="plan"/);
    expect(html).toContain('<option value="basic">Basic</option>');
    expect(html).toContain('<option value="pro">Pro</option>');
    expect(html).toContain('<option value="" selected=""></option>');
  });

  test("lets a multiple select take more than one answer", () => {
    const html = renderForm(
      defineForm("signup", {
        fields: [select("topics").options(["news", "events"]).multiple()],
      }),
    );

    expect(html).toMatch(/<select[^>]*data-plumix-form-control="topics"/);
    expect(html).toMatch(/data-plumix-form-control="topics"[^>]*multiple/);
  });

  test("renders a toggle as a checkbox, checked from its default", () => {
    const html = renderForm(
      defineForm("signup", {
        fields: [toggle("newsletter").default(true), toggle("sms")],
      }),
    );

    expect(html).toMatch(
      /data-plumix-form-control="newsletter"[^>]*type="checkbox"/,
    );
    expect(html).toMatch(/data-plumix-form-control="newsletter"[^>]*checked/);
    expect(html).not.toMatch(/data-plumix-form-control="sms"[^>]*checked/);
  });

  // React only complains about a mismatched control at render — a single
  // select handed a list default, say — and complaining is all it does.
  test("renders every roster type without React objecting to one", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderForm(
      defineForm("roster", {
        fields: [
          text("name"),
          email("email"),
          url("website"),
          tel("phone"),
          number("guests"),
          date("visitOn"),
          select("plan").options(["basic", "pro"]),
          select("topics").options(["news", "events"]).multiple(),
          toggle("newsletter"),
          textarea("message"),
        ],
      }),
    );

    expect(spy.mock.calls).toEqual([]);
    spy.mockRestore();
  });

  test("seeds a field's declared default into its control", () => {
    const html = renderForm(
      defineForm("signup", { fields: [text("source").default("web")] }),
    );

    expect(html).toMatch(/data-plumix-form-control="source"[^>]*value="web"/);
  });
});

describe("a field with a visibility condition", () => {
  const plan = select("plan").options(["basic", "pro"]).default("basic");

  test("is rendered when the form's defaults satisfy it", () => {
    const html = renderForm(
      defineForm("signup", {
        fields: [plan, text("seats").visibleWhen(plan.is("basic"))],
      }),
    );

    expect(html).toContain('data-plumix-form-control="seats"');
  });

  test("is not rendered when the form's defaults do not", () => {
    const html = renderForm(
      defineForm("signup", {
        fields: [plan, text("seats").visibleWhen(plan.is("pro"))],
      }),
    );

    expect(html).not.toContain("seats");
  });
});

describe("the form block in the editor", () => {
  test("renders the form as markup, so the editor arranges it rather than fills it in", () => {
    const html = render("contact", "edit");

    expect(html).toContain('data-plumix-form="contact"');
    expect(html).toContain('data-plumix-form-control="name"');
  });
});
