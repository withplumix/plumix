import { auth, plumix } from "plumix";
import { email, text } from "plumix/fields";

import { defineForm, forms } from "@plumix/plugin-forms";
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
  ],
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
  plugins: [pages, forms({ forms: [contact] })],
  theme,
});
