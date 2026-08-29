import { email, select, text } from "plumix/fields";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { SubmittedValues } from "../answers.js";
import type { FormDefinition } from "../define-form.js";
import type { FormFieldError } from "../types.js";
import { FORM_SLUG_FIELD, TOKEN_FIELD } from "../contract.js";
import { defineForm } from "../define-form.js";
import { pageBreak } from "../steps.js";
import { FormMarkup } from "./form-markup.js";

const contact = defineForm("contact", {
  title: "Get in touch",
  fields: [
    text("name").label("Your name").required().description("As it is spelled"),
    email("email").label("Email"),
  ],
});

function render(props: {
  errors?: readonly FormFieldError[];
  answers?: SubmittedValues;
  token?: string | null;
}): string {
  return renderToStaticMarkup(
    <FormMarkup
      form={contact}
      action="/_plumix/forms/submit"
      idBase="f"
      {...props}
    />,
  );
}

describe("a field's describing relationships", () => {
  test("points the control at its own help text", () => {
    const html = render({});

    expect(html).toMatch(/id="f-name-help"/);
    expect(html).toMatch(
      /data-plumix-form-control="name"[^>]*aria-describedby="f-name-help"/,
    );
  });

  test("points the control at the error it produced, and marks it invalid", () => {
    const html = render({
      errors: [{ field: "name", message: "Your name is required." }],
    });

    expect(html).toContain('id="f-name-error"');
    expect(html).toMatch(
      /data-plumix-form-control="name"[^>]*aria-describedby="f-name-help f-name-error"/,
    );
    expect(html).toMatch(
      /data-plumix-form-control="name"[^>]*aria-invalid="true"/,
    );
  });

  test("leaves a control with nothing to describe undescribed", () => {
    const html = render({});

    expect(html).not.toMatch(
      /data-plumix-form-control="email"[^>]*aria-describedby/,
    );
  });
});

describe("the error summary", () => {
  test("is announced and takes focus", () => {
    const html = render({
      errors: [{ field: "name", message: "Your name is required." }],
    });

    expect(html).toMatch(/data-plumix-form-summary[^>]*role="alert"/);
    expect(html).toMatch(/data-plumix-form-summary[^>]*tabindex="-1"/);
  });

  test("links each message to the control that produced it", () => {
    const html = render({
      errors: [
        { field: "name", message: "Your name is required." },
        { field: "email", message: "Email must look like name@example.com." },
      ],
    });

    expect(html).toContain('href="#f-name"');
    expect(html).toContain('href="#f-email"');
    expect(html).toContain("Email must look like name@example.com.");
  });

  test("is absent from a form nobody has failed to submit", () => {
    expect(render({})).not.toContain("data-plumix-form-summary");
  });
});

describe("what the markup carries", () => {
  test("signals a required field by more than colour", () => {
    const html = render({});

    expect(html).toMatch(/data-plumix-form-required[^>]*aria-hidden="true"/);
    expect(html).toMatch(/data-plumix-form-control="name"[^>]*required/);
  });

  test("keeps what the visitor answered", () => {
    const html = render({
      answers: { name: "Ada", email: "ada@example.test" },
    });

    expect(html).toMatch(/data-plumix-form-control="name"[^>]*value="Ada"/);
  });

  test("carries nothing per-visitor when no token was issued", () => {
    expect(render({})).not.toContain(TOKEN_FIELD);
  });

  test("carries what the field declared about the answer it takes", () => {
    const capped = defineForm("capped", {
      fields: [
        text("subject").label("Subject").maxLength(60).placeholder("Hi"),
      ],
    });

    const html = renderToStaticMarkup(
      <FormMarkup form={capped} action="/submit" idBase="f" />,
    );

    expect(html).toMatch(
      /data-plumix-form-control="subject"[^>]*maxLength="60"/i,
    );
    expect(html).toMatch(
      /data-plumix-form-control="subject"[^>]*placeholder="Hi"/,
    );
  });

  test("carries the token the island fetched once it has one", () => {
    const html = render({ token: "issued.signature" });

    expect(html).toContain(`name="${TOKEN_FIELD}"`);
    expect(html).toContain('value="issued.signature"');
  });
});

describe("an error that belongs to no field", () => {
  test("is listed without a link, since there is no control to send anyone to", () => {
    const html = render({
      errors: [{ field: "", message: "Your submission could not be sent." }],
    });

    expect(html).toContain("Your submission could not be sent.");
    expect(html).not.toContain('href="#f-"');
  });
});

describe("the enhanced form", () => {
  test("says so in the markup, and leaves validation to the server", () => {
    const html = renderToStaticMarkup(
      <FormMarkup form={contact} action="/submit" idBase="f" enhanced />,
    );

    expect(html).toContain("data-plumix-form-enhanced");
    expect(html).toContain("noValidate");
  });

  test("is not what the server renders, so a plain form keeps the browser's checks", () => {
    const html = render({});

    expect(html).not.toContain("data-plumix-form-enhanced");
    expect(html).not.toContain("noValidate");
  });
});

const survey = defineForm("survey", {
  submitLabel: "Send it",
  fields: [
    text("name").label("Your name"),
    pageBreak("Your enquiry"),
    text("subject").label("Subject"),
    pageBreak(),
    text("budget").label("Budget"),
  ],
});

const renderStep = (step: number | undefined): string =>
  renderToStaticMarkup(
    <FormMarkup form={survey} action="/submit" idBase="f" step={step} />,
  );

describe("a form broken into steps", () => {
  test("is one long form for a visitor whose browser never asked for a step", () => {
    const html = renderStep(undefined);

    expect(html).toContain('data-plumix-form-control="name"');
    expect(html).toContain('data-plumix-form-control="subject"');
    expect(html).toContain('data-plumix-form-control="budget"');
    expect(html).not.toContain("data-plumix-form-steps");
  });

  test("shows one step's fields at a time", () => {
    const html = renderStep(1);

    expect(html).toContain('data-plumix-form-control="subject"');
    expect(html).not.toContain('data-plumix-form-control="name"');
    expect(html).not.toContain('data-plumix-form-control="budget"');
  });

  test("heads the step with its title, and takes focus there", () => {
    expect(renderStep(1)).toMatch(
      /data-plumix-form-step-title[^>]*tabindex="-1"[^>]*>Your enquiry</i,
    );
  });

  test("heads a step at the level the form's own title leaves free", () => {
    const stepped = { fields: [text("name"), pageBreak("Later"), text("b")] };
    const head = (form: FormDefinition) =>
      renderToStaticMarkup(
        <FormMarkup form={form} action="/submit" idBase="f" step={0} />,
      );

    // Under the form's own title where there is one; standing in for it
    // where there is not, since an `h3` would then skip a level down
    // from the page's own heading.
    expect(head(defineForm("titled", { title: "Ask", ...stepped }))).toMatch(
      /<h3[^>]*data-plumix-form-step-title/,
    );
    expect(head(defineForm("untitled", stepped))).toMatch(
      /<h2[^>]*data-plumix-form-step-title/,
    );
  });

  test("names a step nobody titled by its position", () => {
    expect(renderStep(2)).toContain(">Step 3 of 3<");
  });

  test("lists every step's title in the progress indicator, marking the one shown", () => {
    const html = renderStep(1);

    expect(html).toContain("Your enquiry");
    expect(html).toMatch(
      /data-plumix-form-step-marker="1"[^>]*aria-current="step"/,
    );
    expect(html).not.toMatch(
      /data-plumix-form-step-marker="0"[^>]*aria-current/,
    );
  });

  test("offers a way back from every step but the first", () => {
    expect(renderStep(0)).not.toContain("data-plumix-form-back");
    expect(renderStep(1)).toContain("data-plumix-form-back");
  });

  test("submits only from the last step, and moves on from the others", () => {
    expect(renderStep(1)).toContain("data-plumix-form-next");
    expect(renderStep(1)).not.toContain("data-plumix-form-submit");
    expect(renderStep(2)).toContain("data-plumix-form-submit");
    expect(renderStep(2)).toContain("Send it");
  });

  test("keeps the honeypot and the form's identity on every step", () => {
    const html = renderStep(1);

    expect(html).toContain("data-plumix-form-honeypot");
    expect(html).toContain(`name="${FORM_SLUG_FIELD}"`);
  });

  test("shows no step chrome once the answers leave it with one step", () => {
    const plan = select("plan").options(["basic", "pro"]);
    const gated = defineForm("gated", {
      fields: [
        plan.label("Plan"),
        pageBreak("Seats"),
        text("seats").visibleWhen(plan.is("pro")),
      ],
    });

    const html = renderToStaticMarkup(
      <FormMarkup form={gated} action="/submit" idBase="f" step={0} />,
    );

    expect(html).toContain('data-plumix-form-control="plan"');
    expect(html).not.toContain("data-plumix-form-steps");
    expect(html).toContain("data-plumix-form-submit");
  });
});
