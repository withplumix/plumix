import { email, group, repeater, select, text, toggle } from "plumix/fields";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { SubmittedValues } from "../answers.js";
import type { FormDefinition } from "../define-form.js";
import type { FormFieldError } from "../types.js";
import type { FormMarkupProps } from "./form-markup.js";
import { FORM_SLUG_FIELD, TOKEN_FIELD, TURNSTILE_FIELD } from "../contract.js";
import { defineForm, toFormWire } from "../define-form.js";
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
      form={toFormWire(contact)}
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
      <FormMarkup form={toFormWire(capped)} action="/submit" idBase="f" />,
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
      <FormMarkup
        form={toFormWire(contact)}
        action="/submit"
        idBase="f"
        enhanced
      />,
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
    <FormMarkup
      form={toFormWire(survey)}
      action="/submit"
      idBase="f"
      step={step}
    />,
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
        <FormMarkup
          form={toFormWire(form)}
          action="/submit"
          idBase="f"
          step={0}
        />,
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
      <FormMarkup
        form={toFormWire(gated)}
        action="/submit"
        idBase="f"
        step={0}
      />,
    );

    expect(html).toContain('data-plumix-form-control="plan"');
    expect(html).not.toContain("data-plumix-form-steps");
    expect(html).toContain("data-plumix-form-submit");
  });
});

describe("a group", () => {
  const profile = defineForm("profile", {
    fields: [
      group("address")
        .fields([text("city").label("City"), text("postcode")])
        .label("Address"),
    ],
  });

  const html = renderToStaticMarkup(
    <FormMarkup form={toFormWire(profile)} action="/submit" idBase="f" />,
  );

  test("groups its members in a fieldset that names itself", () => {
    expect(html).toContain('data-plumix-form-group="address"');
    expect(html).toContain("<legend");
    expect(html).toContain("Address");
  });

  test("posts each member under the group's own name", () => {
    expect(html).toMatch(
      /data-plumix-form-control="address\[city\]"[^>]*name="address\[city\]"/,
    );
  });

  test("gives the member an id its own label can point at", () => {
    expect(html).toMatch(/for="f-address\.city"/);
    expect(html).toContain('id="f-address.city"');
  });
});

describe("a repeater", () => {
  const vegetarian = toggle("vegetarian");
  const attendees = repeater("attendees")
    .fields([
      text("who").label("Name"),
      vegetarian,
      text("dietary").visibleWhen(vegetarian.isOn()),
    ])
    .label("Attendees")
    .min(2)
    .max(3);
  const party = defineForm("party", { fields: [attendees] });

  const render = (props: Partial<FormMarkupProps> = {}): string =>
    renderToStaticMarkup(
      <FormMarkup
        form={toFormWire(party)}
        action="/submit"
        idBase="f"
        {...props}
      />,
    );

  test("serves the fewest rows it accepts, each carrying one marker", () => {
    const html = render();

    expect(html.match(/name="attendees\[\]"/g)).toHaveLength(2);
    expect(html).toContain('data-plumix-form-control="attendees[0][who]"');
    expect(html).toContain('data-plumix-form-control="attendees[1][who]"');
  });

  test("judges a row's condition against that row's own answers", () => {
    const html = render({
      answers: {
        attendees: [{ vegetarian: true }, { vegetarian: false }],
      },
    });

    expect(html).toContain('data-plumix-form-control="attendees[0][dietary]"');
    expect(html).not.toContain(
      'data-plumix-form-control="attendees[1][dietary]"',
    );
  });

  test("offers no add or remove to a visitor nothing is driving the form for", () => {
    const html = render();

    expect(html).not.toContain("data-plumix-form-row-add");
    expect(html).not.toContain("data-plumix-form-row-remove");
  });

  test("offers a row to add once the island is driving it", () => {
    const html = render({ onRowsChange: () => undefined });

    expect(html).toContain('data-plumix-form-row-add="attendees"');
  });

  // Removing down to fewer rows than the repeater accepts would only
  // hand the visitor an error they cannot see the cause of.
  test("offers no row to remove until there is one to spare", () => {
    expect(render({ onRowsChange: () => undefined })).not.toContain(
      "data-plumix-form-row-remove",
    );
    expect(
      render({
        onRowsChange: () => undefined,
        rows: { attendees: ["0", "1", "2"] },
      }),
    ).toContain('data-plumix-form-row-remove="attendees[0]"');
  });

  test("stops offering more rows at the maximum it takes", () => {
    const html = render({
      onRowsChange: () => undefined,
      rows: { attendees: ["0", "1", "2"] },
    });

    expect(html).not.toContain("data-plumix-form-row-add");
    expect(html).toContain('data-plumix-form-row-remove="attendees[2]"');
  });

  // The server asks a blank row nothing, so a browser insisting on one
  // would strand a visitor with no JavaScript on a form it will accept.
  test("leaves the browser's own required off a row nobody has to fill", () => {
    const optionalRows = defineForm("rsvp", {
      fields: [
        repeater("guests").fields([text("who").label("Name").required()]),
      ],
    });

    const html = renderToStaticMarkup(
      <FormMarkup
        form={toFormWire(optionalRows)}
        action="/submit"
        idBase="f"
      />,
    );

    expect(html).toContain('data-plumix-form-control="guests[0][who]"');
    expect(html).not.toMatch(
      /data-plumix-form-control="guests\[0\]\[who\]"[^>]*required/,
    );
    // Still marked required for a reader: it is, once the row is used.
    expect(html).toContain("data-plumix-form-required");
  });

  test("keeps it on a row the repeater does insist on", () => {
    const insists = defineForm("rsvp", {
      fields: [
        repeater("guests")
          .fields([text("who").label("Name").required()])
          .min(1),
      ],
    });

    const html = renderToStaticMarkup(
      <FormMarkup form={toFormWire(insists)} action="/submit" idBase="f" />,
    );

    expect(html).toMatch(
      /data-plumix-form-control="guests\[0\]\[who\]"[^>]*required/,
    );
  });

  test("links an error inside a row to the control that produced it", () => {
    const html = render({
      errors: [{ field: "attendees[1][who]", message: "Name is required." }],
    });

    expect(html).toContain('href="#f-attendees.1.who"');
    expect(html).toContain('data-plumix-form-error="attendees[1][who]"');
    expect(html).toMatch(
      /data-plumix-form-control="attendees\[1\]\[who\]"[^>]*aria-invalid="true"/,
    );
  });

  test("links a row-count error to the repeater itself", () => {
    const html = render({
      errors: [
        { field: "attendees", message: "Attendees needs at least 2 entries." },
      ],
    });

    expect(html).toContain('href="#f-attendees"');
    expect(html).toMatch(
      /data-plumix-form-repeater="attendees"[^>]*aria-invalid="true"/,
    );
  });
});

// Two ways a nested repeater used to disagree with the row it sits in.
describe("a repeater inside a repeater row", () => {
  const nested = defineForm("survey", {
    fields: [
      repeater("sections")
        .fields([
          text("heading"),
          repeater("points")
            .fields([text("point").label("Point").required()])
            .min(1),
        ])
        .label("Sections"),
    ],
  });

  test("inherits the outer row's licence to be left blank", () => {
    const html = renderToStaticMarkup(
      <FormMarkup form={toFormWire(nested)} action="/submit" idBase="f" />,
    );

    expect(html).toContain(
      'data-plumix-form-control="sections[0][points][0][point]"',
    );
    expect(html).not.toMatch(
      /data-plumix-form-control="sections\[0\]\[points\]\[0\]\[point\]"[^>]*required/,
    );
  });
});

describe("a row the island added", () => {
  const kind = select("kind").options(["note", "quote"]).default("quote");
  const entries = defineForm("entries", {
    fields: [
      repeater("items")
        .fields([
          kind,
          text("source").label("Source").visibleWhen(kind.is("quote")),
        ])
        .label("Items"),
    ],
  });

  // The added row is past what the server rendered, so it has no answers
  // of its own — judged by an empty bag it would hide a field its own
  // default makes visible, and the server would then ask for an answer
  // the page has nowhere to give.
  test("shows the same fields as the row the server served", () => {
    const html = renderToStaticMarkup(
      <FormMarkup
        form={toFormWire(entries)}
        action="/submit"
        idBase="f"
        rows={{ items: ["0", "1"] }}
        onRowsChange={() => undefined}
      />,
    );

    expect(html).toContain('data-plumix-form-control="items[0][source]"');
    expect(html).toContain('data-plumix-form-control="items[1][source]"');
  });
});

describe("a form that opted into a captcha", () => {
  const guarded = defineForm("guarded", {
    fields: [text("name").label("Your name")],
    turnstile: { siteKey: "0x4AAAsite", secret: "shhh" },
  });

  const guardedHtml = (props: Partial<FormMarkupProps> = {}): string =>
    renderToStaticMarkup(
      <FormMarkup
        form={toFormWire(guarded)}
        action="/submit"
        idBase="f"
        {...props}
      />,
    );

  // The container and nothing in it: the widget is the island's to draw
  // — see `drawCaptcha` — so this is the room left for it.
  test("leaves the widget somewhere to be drawn, named by the site key", () => {
    expect(guardedHtml()).toContain('data-plumix-form-captcha="0x4AAAsite"');
  });

  // Turnstile is drawn by a script, so this is the one place the plugin's
  // no-JavaScript path stops — said out loud rather than left as a box
  // that never fills in.
  test("tells a visitor with no JavaScript why", () => {
    expect(guardedHtml()).toContain(
      "This form needs JavaScript enabled to check you are not a robot.",
    );
  });

  test("never renders the secret", () => {
    expect(guardedHtml()).not.toContain("shhh");
  });

  test("renders a refusal against the widget and links the summary to it", () => {
    const html = guardedHtml({
      errors: [{ field: TURNSTILE_FIELD, message: "Please try again." }],
    });

    expect(html).toContain(`href="#f-${TURNSTILE_FIELD}"`);
    expect(html).toContain(`data-plumix-form-error="${TURNSTILE_FIELD}"`);
    expect(html).toMatch(
      new RegExp(`id="f-${TURNSTILE_FIELD}"[^>]*aria-describedby`),
    );
  });

  test("leaves a form that declared none untouched", () => {
    expect(render({})).not.toContain("plumix-form-captcha");
  });
});

// A widget on a step the visitor pages away from is a token issued for a
// submission that has not happened yet, and a challenge solved twice.
describe("a captcha on a wizard", () => {
  const wizard = defineForm("wizard", {
    fields: [
      text("name").label("Your name"),
      pageBreak(),
      text("message").label("Message"),
    ],
    turnstile: { siteKey: "0x4AAAsite", secret: "shhh" },
  });

  const step = (index: number | undefined): string =>
    renderToStaticMarkup(
      <FormMarkup
        form={toFormWire(wizard)}
        action="/submit"
        idBase="f"
        step={index}
      />,
    );

  test("is held back until the step that submits", () => {
    expect(step(0)).not.toContain("plumix-form-captcha");
    expect(step(1)).toContain("plumix-form-captcha");
  });

  // What a visitor with no JavaScript posts: every step at once, so the
  // one submit button they get has to carry the widget.
  test("is on the flat form nobody is stepping through", () => {
    expect(step(undefined)).toContain("plumix-form-captcha");
  });
});
