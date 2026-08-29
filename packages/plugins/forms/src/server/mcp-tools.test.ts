import { email, group, select, text, textarea } from "plumix/fields";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { SubmissionDTO } from "../types.js";
import { defineForm } from "../define-form.js";
import { forms } from "../index.js";
import { pageBreak } from "../steps.js";
import { applyFormsSchema } from "../test/db.js";
import { seedSubmissionOn } from "../test/factories.js";

type Harness = Awaited<ReturnType<typeof createDispatcherHarness>>;

const reason = () => select("reason").options(["sales", "other"]);

const contact = defineForm("contact", {
  title: "Contact us",
  fields: [
    text("name").label("Your name").required(),
    reason().label("Reason"),
    text("detail").label("Tell us more").visibleWhen(reason().is("other")),
  ],
});

const newsletter = defineForm("newsletter", {
  title: "Newsletter",
  bind: "entry",
  retentionDays: 90,
  fields: [
    email("email").label("Email").required(),
    select("plan")
      .options([
        { value: "basic", label: "Basic" },
        { value: "pro", label: "Pro" },
      ])
      .label("Plan"),
    pageBreak("About you"),
    group("address")
      .fields([text("city").label("City")])
      .label("Address"),
    textarea("why").label("Why"),
  ],
});

async function setup(): Promise<Harness> {
  const harness = await createDispatcherHarness({
    plugins: [forms({ forms: [contact, newsletter] })],
    mcp: { enabled: true },
  });
  await applyFormsSchema(harness.db);
  return harness;
}

async function mintPat(
  h: Harness,
  scopes: string[] | null = null,
): Promise<string> {
  const user = await h.seedUser("editor");
  const { secret } = await h.factory.apiToken.create({
    userId: user.id,
    scopes,
  });
  return secret;
}

interface ToolCallResult {
  readonly content: readonly { readonly text: string }[];
  readonly isError?: boolean;
}

async function rpc<T>(
  h: Harness,
  secret: string,
  body: unknown,
): Promise<{ result: T; error?: { message: string } }> {
  const res = await h.dispatch(
    new Request("https://cms.example/_plumix/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    }),
  );
  return (await res.json()) as { result: T; error?: { message: string } };
}

function callTool(
  h: Harness,
  secret: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ result: ToolCallResult }> {
  return rpc(h, secret, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

function payloadOf<T>(result: ToolCallResult): T {
  return JSON.parse(result.content[0]?.text ?? "null") as T;
}

interface SubmissionsPayload {
  readonly submissions: readonly SubmissionDTO[];
  readonly total: number;
  readonly nextCursor: string | null;
}

describe("@plumix/plugin-forms — MCP tools", () => {
  test("form_list names every registered form", async () => {
    const h = await setup();
    const secret = await mintPat(h);

    const { result } = await callTool(h, secret, "form_list");

    const payload = payloadOf<{ forms: { slug: string; title: string }[] }>(
      result,
    );
    expect(payload.forms).toEqual([
      { slug: "contact", title: "Contact us" },
      { slug: "newsletter", title: "Newsletter" },
    ]);
  });

  test("form_describe reports a form's fields, options and steps", async () => {
    const h = await setup();
    const secret = await mintPat(h);

    const { result } = await callTool(h, secret, "form_describe", {
      slug: "newsletter",
    });

    expect(payloadOf<Record<string, unknown>>(result)).toEqual({
      slug: "newsletter",
      title: "Newsletter",
      submitLabel: null,
      stores: true,
      binds: "entry",
      retentionDays: 90,
      captcha: false,
      fields: [
        {
          key: "email",
          label: "Email",
          inputType: "email",
          type: "string",
          required: true,
        },
        {
          key: "plan",
          label: "Plan",
          inputType: "select",
          type: "string",
          required: false,
          options: [
            { value: "basic", label: "Basic" },
            { value: "pro", label: "Pro" },
          ],
        },
        {
          key: "address",
          label: "Address",
          inputType: "group",
          type: "json",
          required: false,
          fields: [
            {
              key: "city",
              label: "City",
              inputType: "text",
              type: "string",
              required: false,
            },
          ],
        },
        {
          key: "why",
          label: "Why",
          inputType: "textarea",
          type: "string",
          required: false,
        },
      ],
      steps: [
        { title: null, fields: ["email", "plan"] },
        { title: "About you", fields: ["address", "why"] },
      ],
    });
  });

  test("form_describe marks a field the form only sometimes asks", async () => {
    const h = await setup();
    const secret = await mintPat(h);

    const { result } = await callTool(h, secret, "form_describe", {
      slug: "contact",
    });

    const shape = payloadOf<{
      fields: { key: string; conditional?: true }[];
    }>(result);
    expect(shape.fields.map((field) => field.conditional)).toEqual([
      undefined,
      undefined,
      true,
    ]);
  });

  test("form_describe hides a form nobody declared", async () => {
    const h = await setup();
    const secret = await mintPat(h);

    const { result } = await callTool(h, secret, "form_describe", {
      slug: "nope",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("not_found");
  });

  test("form_submission_list narrows by form, status and date range", async () => {
    const h = await setup();
    const secret = await mintPat(h);
    await seedSubmissionOn(h.db, "contact", "2026-08-22");
    const monday = await seedSubmissionOn(h.db, "contact", "2026-08-24");
    const sunday = await seedSubmissionOn(h.db, "contact", "2026-08-30");
    await seedSubmissionOn(h.db, "contact", "2026-08-25", "spam");
    await seedSubmissionOn(h.db, "newsletter", "2026-08-25");

    const { result } = await callTool(h, secret, "form_submission_list", {
      form: "contact",
      status: "new",
      since: "2026-08-24",
      until: "2026-08-30",
    });

    const payload = payloadOf<SubmissionsPayload>(result);
    expect(payload.submissions.map((row) => row.id)).toEqual([
      sunday.id,
      monday.id,
    ]);
    expect(payload.total).toBe(2);
    expect(payload.nextCursor).toBeNull();
  });

  test("form_submission_list counts past the page it returns", async () => {
    const h = await setup();
    const secret = await mintPat(h);
    for (const day of ["2026-08-24", "2026-08-25", "2026-08-26"]) {
      await seedSubmissionOn(h.db, "contact", day);
    }

    const { result } = await callTool(h, secret, "form_submission_list", {
      limit: 1,
    });

    const payload = payloadOf<SubmissionsPayload>(result);
    expect(payload.submissions).toHaveLength(1);
    expect(payload.total).toBe(3);
    expect(payload.nextCursor).not.toBeNull();
  });

  test.each([
    ["prose", "last tuesday"],
    // `Date.parse` takes both of these, and both would land on a
    // midnight rather than on the day the caller named.
    ["a loose date", "2026-8-24"],
    ["an instant with no zone", "2026-08-24T10:00:00"],
  ])("form_submission_list refuses %s as a bound", async (_label, since) => {
    const h = await setup();
    const secret = await mintPat(h);

    const { error } = await rpc<never>(h, secret, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "form_submission_list", arguments: { since } },
    });

    expect(error?.message).toContain("date");
  });

  test("form_submission_list reads an instant that carries its zone", async () => {
    const h = await setup();
    const secret = await mintPat(h);
    await seedSubmissionOn(h.db, "contact", "2026-08-24");

    const { result } = await callTool(h, secret, "form_submission_list", {
      since: "2026-08-24T13:00:00Z",
    });

    expect(payloadOf<SubmissionsPayload>(result).total).toBe(0);
  });

  test("a token without the inbox capability reads nothing", async () => {
    const h = await setup();
    const secret = await mintPat(h, ["entry:post:read"]);

    const calls: [string, Record<string, unknown>][] = [
      ["form_list", {}],
      ["form_describe", { slug: "contact" }],
      ["form_submission_list", {}],
    ];
    for (const [name, args] of calls) {
      const { result } = await callTool(h, secret, name, args);

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("forbidden");
    }
  });

  test("advertises three read-only tools and nothing that writes", async () => {
    const h = await setup();
    const secret = await mintPat(h);

    const { result } = await rpc<{
      tools: {
        name: string;
        inputSchema: { type: string; properties?: Record<string, unknown> };
        annotations?: { readOnlyHint?: boolean };
      }[];
    }>(h, secret, { jsonrpc: "2.0", id: 1, method: "tools/list" });

    const ours = result.tools.filter((tool) => tool.name.startsWith("form"));
    expect(ours.map((tool) => tool.name)).toEqual([
      "form_list",
      "form_describe",
      "form_submission_list",
    ]);
    expect(ours.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(
      true,
    );
    // The date bounds carry a transform, which the JSON Schema projection
    // has to render rather than drop — an agent that cannot see them
    // cannot filter by them.
    const list = ours.find((tool) => tool.name === "form_submission_list");
    expect(Object.keys(list?.inputSchema.properties ?? {})).toEqual([
      "form",
      "status",
      "since",
      "until",
      "limit",
      "cursor",
    ]);
  });
});
