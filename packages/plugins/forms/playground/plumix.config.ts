import { auth, plumix } from "plumix";
import {
  email,
  group,
  repeater,
  select,
  text,
  textarea,
  toggle,
} from "plumix/fields";

import { defineForm, forms, pageBreak } from "@plumix/plugin-forms";
import { pages } from "@plumix/plugin-pages";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
} from "@plumix/runtime-cloudflare";

import { theme } from "./theme.js";

// Plumix consumer wiring the forms plugin on top of pages (for the `page`
// entry type and its root permalink) — the smallest config that dogfoods
// `@plumix/plugin-forms` end to end. The worker-driven e2e suite in
// `../e2e` boots it and drives the contact form below the way a visitor
// would: with JavaScript, and with it switched off.

const deployOrigin = cloudflareDeployOrigin({
  workerName: "plumix-forms-playground",
  accountSubdomain: "local",
  // CSRF origin-allowlist must match what the browser sends. The e2e
  // harness boots `plumix dev --port 3100` (see
  // `e2e/playwright.config.ts`); override here if you boot the playground
  // manually with a different `--port`.
  localOrigin: "http://localhost:3100",
});

const vegetarian = toggle("vegetarian").label("Vegetarian");

const contact = defineForm("contact", {
  title: "Get in touch",
  submitLabel: "Send enquiry",
  fields: [
    text("name")
      .label("Your name")
      .required()
      .description("However you would like to be addressed."),
    email("email").label("Email address").required(),
    text("subject").label("Subject").maxLength(80),
    group("company")
      .fields([text("name").label("Company"), text("vatNumber").label("VAT")])
      .label("Your organisation"),
    repeater("attendees")
      .fields([
        text("who").label("Name").required(),
        vegetarian,
        text("dietary").label("Dietary needs").visibleWhen(vegetarian.isOn()),
      ])
      .label("Attendees")
      .max(3),
  ],
});

// A wizard: page breaks in the same flat field list, and a question on
// the last step that only a plan chosen on the step before it reveals.
const plan = select("plan").options([
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
]);

const survey = defineForm("survey", {
  title: "Tell us about your project",
  submitLabel: "Send survey",
  fields: [
    pageBreak("About you"),
    text("name").label("Your name").required(),
    email("email").label("Email address").required(),
    pageBreak("Your plan"),
    plan.label("Which plan?"),
    pageBreak(),
    text("seats").label("How many seats?").visibleWhen(plan.is("pro")),
    textarea("notes").label("Anything else?"),
  ],
});

// A whole step behind a condition: with `basic` chosen there is one
// step and the button submits; with `pro` there are two and it moves on.
// What the button says and what it does are read from the same answers,
// and this is the form that proves it.
const seatsPlan = select("plan").options([
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
]);

const gated = defineForm("gated", {
  title: "Pick a plan",
  fields: [
    seatsPlan.label("Which plan?"),
    pageBreak("Seats"),
    text("seats").label("How many seats?").visibleWhen(seatsPlan.is("pro")),
  ],
});

// The form behind the theme's own subscribe bar: one question, and no
// block anywhere places it — the bar is the theme's markup driven by the
// headless hook.
const subscribe = defineForm("subscribe", {
  title: "Subscribe",
  fields: [email("email").label("Email address").required()],
});

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Forms playground",
      ...deployOrigin,
    },
  }),
  plugins: [pages, forms({ forms: [contact, survey, gated, subscribe] })],
  theme,
});
