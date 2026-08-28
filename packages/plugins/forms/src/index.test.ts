import { email, text } from "plumix/fields";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import * as adminEntry from "./admin/index.js";
import { TEL_FIELD_COMPONENT, TEL_INPUT_TYPE } from "./contract.js";
import { defineForm } from "./define-form.js";
import { forms } from "./index.js";
import { createFormsHarness, seedPageWithForm } from "./test/harness.js";

const contact = defineForm("contact", {
  title: "Contact us",
  submitLabel: "Send",
  fields: [text("name").label("Your name").required(), email("email")],
});

const newsletterPlugin = definePlugin("newsletter", (ctx) => {
  ctx.registerForm(defineForm("newsletter", { fields: [email("email")] }));
});

async function renderPage(
  plugins: Parameters<typeof createFormsHarness>[0],
  slug = "contact",
): Promise<string> {
  const harness = await createFormsHarness(plugins);
  await seedPageWithForm(harness, slug);
  const response = await harness.fetch("/posts/page-with-form");
  response.assertStatus(200);
  return response.text();
}

describe("forms registration", () => {
  test("a form declared in config resolves by slug", async () => {
    const body = await renderPage([forms({ forms: [contact] })]);

    expect(body).toContain('data-plumix-form="contact"');
  });

  test("a plugin-registered form resolves by slug", async () => {
    const body = await renderPage([forms(), newsletterPlugin], "newsletter");

    expect(body).toContain('data-plumix-form="newsletter"');
  });

  test("a plugin registered before the forms plugin still resolves", async () => {
    const body = await renderPage([newsletterPlugin, forms()], "newsletter");

    expect(body).toContain('data-plumix-form="newsletter"');
  });

  // A descriptor is a value: the config loader caches it and a Vite build
  // installs it more than once in one process. Appending on each install
  // made the second one fail with "one from config, one from config".
  test("survives being installed twice, as a build installs it", async () => {
    const descriptor = forms({ forms: [contact] });
    await createFormsHarness([descriptor]);
    const harness = await createFormsHarness([descriptor]);
    await seedPageWithForm(harness, "contact");

    const response = await harness.fetch("/posts/page-with-form");

    response.assertStatus(200);
    expect(await response.text()).toContain('data-plumix-form="contact"');
  });

  test("survives a contributing plugin being installed twice", async () => {
    const descriptors = [forms(), newsletterPlugin];
    await createFormsHarness(descriptors);

    const body = await renderPage(descriptors, "newsletter");

    expect(body).toContain('data-plumix-form="newsletter"');
  });

  test("two forms sharing a slug are rejected at boot, naming both", async () => {
    const collidingPlugin = definePlugin("newsletter", (ctx) => {
      ctx.registerForm(defineForm("contact", { fields: [email("email")] }));
    });

    await expect(
      createDispatcherHarness({
        plugins: [forms({ forms: [contact] }), collidingPlugin],
      }),
    ).rejects.toThrow(/"contact".*config.*newsletter/s);
  });
});

describe("the form block on a public page", () => {
  test("renders a labelled control per field inside a posting form", async () => {
    const body = await renderPage([forms({ forms: [contact] })]);

    expect(body).toContain('action="/_plumix/forms/submit"');
    expect(body).toContain('method="post"');
    expect(body).toContain('data-plumix-form-control="name"');
    expect(body).toContain('data-plumix-form-control="email"');
    expect(body).toContain("Your name");
    expect(body).toContain("Send");
  });

  test("renders two identical bytes for two visitors", async () => {
    const harness = await createFormsHarness([forms({ forms: [contact] })]);
    await seedPageWithForm(harness, "contact");

    const first = await (await harness.fetch("/posts/page-with-form")).text();
    const second = await (await harness.fetch("/posts/page-with-form")).text();

    expect(first).toBe(second);
  });

  test("renders nothing for a slug nobody registered", async () => {
    const body = await renderPage([forms()], "ghost");

    expect(body).not.toContain("plumix-form");
    expect(body).not.toContain("ghost");
  });
});

describe("the tel field type", () => {
  test("is contributed to the host's field vocabulary", async () => {
    const harness = await createFormsHarness([forms()]);

    expect(harness.app.plugins.fieldTypes.get(TEL_INPUT_TYPE)).toMatchObject({
      type: TEL_INPUT_TYPE,
      component: TEL_FIELD_COMPONENT,
      registeredBy: "forms",
    });
  });

  // The admin bundler resolves the registration's `component` as a named
  // export off this module. A rename on one side alone leaves every `tel`
  // field falling through to the host's text-input fallback, and only at
  // build time — nothing in `plumix dev` would say so.
  test("names a component the admin entry actually exports", () => {
    expect(adminEntry).toHaveProperty(TEL_FIELD_COMPONENT);
  });
});
