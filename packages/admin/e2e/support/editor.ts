// Shared fixtures + interaction helpers for the editor specs.
// The mock harness can't prove server persistence, so specs assert the
// two client contracts instead: what the canvas renders, and what
// envelope entry.update receives.

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { AUTHED_ADMIN, mockRpcWithCapture } from "./rpc-mock.js";

export const T0 = new Date("2026-05-20T00:00:00Z");

export interface EditorEntryOptions {
  readonly id?: number;
  readonly status?: "draft" | "published";
  readonly content?: unknown;
  readonly title?: string;
}

export function editorEntry(
  options: EditorEntryOptions = {},
): Record<string, unknown> {
  const id = options.id ?? 1;
  const status = options.status ?? "draft";
  return {
    id,
    type: "post",
    parentId: null,
    title: options.title ?? "Untitled",
    slug: `entry-${String(id)}`,
    content: options.content ?? null,
    excerpt: null,
    status,
    authorId: 1,
    sortOrder: 0,
    publishedAt: status === "published" ? T0 : null,
    createdAt: T0,
    updatedAt: T0,
    meta: {},
  };
}

export interface PublishedEntryOptions {
  readonly title?: string;
  readonly content?: unknown;
  /** Pending autosave row timestamp; omit/null = no pending autosave. */
  readonly autosaveUpdatedAt?: Date | null;
  readonly liveUpdatedAt?: Date;
}

/**
 * Published entry carrying the `_preview` projection the server emits
 * for autosave-capable entry types. A non-null `autosaveUpdatedAt`
 * marks a pending per-user draft (`source: "autosave"`); equal to
 * `liveUpdatedAt` is fresh, older is stale.
 */
export function publishedEntry(
  options: PublishedEntryOptions = {},
): Record<string, unknown> {
  const liveUpdatedAt = options.liveUpdatedAt ?? T0;
  const autosaveUpdatedAt = options.autosaveUpdatedAt ?? null;
  return {
    ...editorEntry({
      status: "published",
      content: options.content,
      title:
        options.title ?? (autosaveUpdatedAt ? "Pending edit" : "Live title"),
    }),
    publishedAt: liveUpdatedAt,
    createdAt: liveUpdatedAt,
    updatedAt: liveUpdatedAt,
    _preview: autosaveUpdatedAt
      ? { source: "autosave", autosaveUpdatedAt, liveUpdatedAt }
      : { source: "live", autosaveUpdatedAt: null, liveUpdatedAt },
    terms: {},
  };
}

/**
 * oRPC `entry/get` envelope for a `publishedEntry`, including the
 * date-revival meta entries the serializer emits — without them the
 * client sees strings where it expects Dates and the draft/stale
 * machinery silently misreads the `_preview` timestamps.
 */
export function publishedEntryRpcBody(entry: Record<string, unknown>): string {
  const preview = entry._preview as {
    readonly autosaveUpdatedAt: Date | null;
  };
  return JSON.stringify({
    json: entry,
    meta: [
      [1, "createdAt"],
      [1, "updatedAt"],
      [1, "publishedAt"],
      [1, "_preview", "liveUpdatedAt"],
      ...(preview.autosaveUpdatedAt
        ? [[1, "_preview", "autosaveUpdatedAt"]]
        : []),
    ],
  });
}

export interface InstallEditorMocksOptions {
  readonly entry?: Record<string, unknown>;
  /** Extra suffix → body handlers, overriding the defaults on collision. */
  readonly handlers?: Readonly<Record<string, unknown>>;
}

/**
 * Standard editor route mocks: session, entry/get, activity (empty),
 * list (empty), and a captured entry/update echoing the entry back.
 * Returns the captured update envelopes for contract assertions.
 */
export function installEditorMocks(
  page: Page,
  options: InstallEditorMocksOptions = {},
): Promise<readonly unknown[]> {
  const entry = options.entry ?? editorEntry();
  return mockRpcWithCapture(page, {
    captureSuffix: "/entry/update",
    captureResponse: entry,
    handlers: {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": entry,
      "/entry/activity/list": { users: [] },
      "/entry/list": [],
      ...options.handlers,
    },
  });
}

// The starter modal opens whenever the manifest carries a starter-
// eligible pattern and the entry content is empty. Specs that aren't
// about the modal start blank.
export async function dismissStarterModal(page: Page): Promise<void> {
  const modal = page.getByTestId("plumix-starter-modal");
  await modal.waitFor({ state: "visible" });
  await page.getByTestId("plumix-starter-modal-start-blank").click();
  await expect(modal).toBeHidden();
}

/** Last captured entry.update envelope, typed for content asserts. */
export function lastUpdate(updates: readonly unknown[]):
  | {
      readonly title?: string;
      readonly content?: {
        readonly version?: string;
        readonly blocks?: readonly {
          readonly name?: string;
          readonly attrs?: Readonly<Record<string, unknown>>;
        }[];
      };
    }
  | undefined {
  return updates.at(-1) as ReturnType<typeof lastUpdate>;
}
