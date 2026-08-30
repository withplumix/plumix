import type { RequestAuthenticator } from "plumix/plugin";
import type { User, UserRole } from "plumix/schema";
import { createRouterClient } from "@orpc/server";
import { text } from "plumix/fields";
import {
  createAppContext,
  createPluginRegistry,
  HookRegistry,
  installPlugins,
} from "plumix/plugin";
import { editorUser, factoriesFor } from "plumix/test";
import { describe, expect, test } from "vitest";

import type {
  FormSubmissionCandidate,
  SubmissionCounts,
  SubmissionDTO,
  SubmissionsPage,
  SubmissionStatus,
} from "./types.js";
import { defineForm } from "./define-form.js";
import { forms } from "./index.js";
import { insertSubmission, recordHandlerFailure } from "./server/repository.js";
import { createFormsTestDb } from "./test/db.js";

interface Client {
  readonly forms: {
    readonly definitions: () => Promise<{ slug: string; title: string }[]>;
    readonly list: (input?: {
      form?: string;
      status?: SubmissionStatus;
      limit?: number;
      cursor?: string;
    }) => Promise<SubmissionsPage>;
    readonly counts: (input?: {
      form?: string;
      status?: SubmissionStatus;
    }) => Promise<SubmissionCounts>;
    readonly get: (input: { id: number }) => Promise<SubmissionDTO>;
    readonly setStatus: (input: {
      id: number;
      status: SubmissionStatus;
    }) => Promise<{ status: SubmissionStatus }>;
    readonly setNote: (input: {
      id: number;
      note: string | null;
    }) => Promise<{ note: string | null }>;
    readonly remove: (input: { id: number }) => Promise<{ deleted: boolean }>;
  };
}

const contact = defineForm("contact", {
  title: "Contact us",
  fields: [text("name").label("Your name")],
});

function stubAuthenticator(user: User): RequestAuthenticator {
  return { authenticate: () => Promise.resolve({ user, tokenScopes: null }) };
}

async function harness(role: UserRole = "editor") {
  const db = await createFormsTestDb();
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  await installPlugins({
    hooks,
    plugins: [forms({ forms: [contact] })],
    registry,
  });

  const user =
    role === "editor"
      ? await editorUser.transient({ db }).create({})
      : await factoriesFor(db).user.create({ role });

  const ctx = createAppContext({
    db,
    env: {},
    request: new Request("https://cms.example/_plumix/rpc", { method: "POST" }),
    hooks,
    plugins: registry,
    user: { id: user.id, email: user.email, role: user.role, meta: {} },
    authenticator: stubAuthenticator(user),
    origin: "https://cms.example",
  });

  const router = registry.rpcRouters.get("forms");
  if (!router) throw new Error("forms router not registered");
  const client = createRouterClient(
    { forms: router },
    { context: ctx },
  ) as unknown as Client;

  const seed = (overrides: Partial<FormSubmissionCandidate> = {}) =>
    insertSubmission(ctx, {
      form: "contact",
      status: "new",
      answers: { name: "Ada" },
      labels: { name: { label: "Your name" } },
      bound: null,
      ipHash: null,
      userAgent: null,
      ...overrides,
    });

  return { client, ctx, seed };
}

describe("the submissions RPC", () => {
  test("names every registered form, so the filter needs no forms table", async () => {
    const h = await harness();

    expect(await h.client.forms.definitions()).toEqual([
      { slug: "contact", title: "Contact us" },
    ]);
  });

  test("lists newest first and hands back a cursor for the rest", async () => {
    const h = await harness();
    await h.seed();
    await h.seed();

    const first = await h.client.forms.list({ limit: 1 });
    const second = await h.client.forms.list({
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });

    expect(first.submissions).toHaveLength(1);
    expect(second.submissions).toHaveLength(1);
    const [newest] = first.submissions;
    const [oldest] = second.submissions;
    expect(newest?.id).toBeGreaterThan(oldest?.id ?? 0);
    expect(second.nextCursor).toBeNull();
  });

  test("carries each row's own label snapshot and its envelope", async () => {
    const h = await harness();
    await h.seed({ ipHash: "deadbeef", userAgent: "curl/8" });

    const [row] = (await h.client.forms.list()).submissions;

    expect(row?.labels).toEqual({ name: { label: "Your name" } });
    expect(row?.answers).toEqual({ name: "Ada" });
    expect(row?.ipHash).toBe("deadbeef");
    expect(row?.userAgent).toBe("curl/8");
    expect(typeof row?.createdAt).toBe("string");
  });

  test("keeps a submission whose form is gone, under the labels it was given", async () => {
    const h = await harness();
    await h.seed({
      form: "retired",
      labels: { name: { label: "What we used to ask" } },
    });

    const counts = await h.client.forms.counts();
    const [row] = (await h.client.forms.list({ form: "retired" })).submissions;

    expect(counts.forms.retired).toBe(1);
    expect(row?.labels).toEqual({ name: { label: "What we used to ask" } });
  });

  test("filters by form and by status, counting each beside the other", async () => {
    const h = await harness();
    await h.seed();
    await h.seed({ status: "spam" });
    await h.seed({ form: "newsletter" });

    expect(
      (await h.client.forms.list({ status: "spam" })).submissions,
    ).toHaveLength(1);
    expect(
      (await h.client.forms.list({ form: "newsletter" })).submissions,
    ).toHaveLength(1);
    const counts = await h.client.forms.counts({ form: "contact" });
    expect(counts.statuses).toEqual({ new: 1, read: 0, archived: 0, spam: 1 });
    expect(counts.forms).toEqual({ contact: 2, newsletter: 1 });
  });

  test("reads one submission back, and refuses one that never was", async () => {
    const h = await harness();
    const row = await h.seed();

    expect((await h.client.forms.get({ id: row.id })).id).toBe(row.id);
    await expect(h.client.forms.get({ id: row.id + 1 })).rejects.toThrow();
  });

  test("marks a submission read, archived or spam", async () => {
    const h = await harness();
    const row = await h.seed();

    for (const status of ["read", "archived", "spam"] as const) {
      expect(
        (await h.client.forms.setStatus({ id: row.id, status })).status,
      ).toBe(status);
    }
    expect((await h.client.forms.get({ id: row.id })).status).toBe("spam");
  });

  test("keeps a private note, and clears it again", async () => {
    const h = await harness();
    const row = await h.seed();

    await h.client.forms.setNote({ id: row.id, note: "Rang back Tuesday" });
    expect((await h.client.forms.get({ id: row.id })).note).toBe(
      "Rang back Tuesday",
    );

    await h.client.forms.setNote({ id: row.id, note: null });
    expect((await h.client.forms.get({ id: row.id })).note).toBeNull();
  });

  test("shows why the form's own handler did not finish", async () => {
    const h = await harness();
    const row = await h.seed();
    await recordHandlerFailure(h.ctx, row.id, "SMTP refused");

    expect((await h.client.forms.get({ id: row.id })).handlerError).toBe(
      "SMTP refused",
    );
  });

  test("deletes a submission", async () => {
    const h = await harness();
    const row = await h.seed();

    expect((await h.client.forms.remove({ id: row.id })).deleted).toBe(true);
    expect((await h.client.forms.list()).submissions).toHaveLength(0);
  });

  test("answers nobody without the capability", async () => {
    const h = await harness("subscriber");

    await expect(h.client.forms.list()).rejects.toThrow();
    await expect(h.client.forms.counts()).rejects.toThrow();
    await expect(h.client.forms.definitions()).rejects.toThrow();
    await expect(h.client.forms.get({ id: 1 })).rejects.toThrow();
    await expect(
      h.client.forms.setStatus({ id: 1, status: "read" }),
    ).rejects.toThrow();
    await expect(
      h.client.forms.setNote({ id: 1, note: "x" }),
    ).rejects.toThrow();
    await expect(h.client.forms.remove({ id: 1 })).rejects.toThrow();
  });
});
