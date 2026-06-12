import type { AppContext } from "plumix/plugin";
import { describe, expect, test, vi } from "vitest";

import type { Comment } from "../db/schema.js";
import { notifyModeratorOfPending } from "./notify.js";

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    status: "pending",
    authorName: "Ada",
    bodyMd: "please review",
    ...overrides,
  } as Comment;
}

function ctxWith(send?: ReturnType<typeof vi.fn>): AppContext {
  return { mailer: send ? { send } : undefined } as unknown as AppContext;
}

describe("notifyModeratorOfPending", () => {
  test("emails the moderator for a pending comment", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await notifyModeratorOfPending(
      ctxWith(send),
      comment(),
      "mod@example.test",
    );
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toMatchObject({ to: "mod@example.test" });
  });

  test("does not email for an approved comment", async () => {
    const send = vi.fn();
    await notifyModeratorOfPending(
      ctxWith(send),
      comment({ status: "approved" }),
      "mod@example.test",
    );
    expect(send).not.toHaveBeenCalled();
  });

  test("is a no-op when no mailer is configured", async () => {
    await expect(
      notifyModeratorOfPending(
        ctxWith(undefined),
        comment(),
        "mod@example.test",
      ),
    ).resolves.toBeUndefined();
  });
});
