import { describe, expect, test } from "vitest";

import {
  looksLikeTheRunBeingOver,
  retryWhatGitHubDropped,
  waitOutALimit,
  whenTheLimitLifts,
} from "./outage.js";

describe("looksLikeTheRunBeingOver", () => {
  test("recognises the sentence claude code actually prints", () => {
    expect(
      looksLikeTheRunBeingOver(
        "claude-code exited with code 1: You've hit your session limit · reset 3pm",
      ),
    ).toBe(true);
  });

  test.each([
    "Claude AI usage limit reached",
    "claude-code exited with code 1: You've hit your weekly limit · resets Sep 30, 10pm (UTC)",
    "rate_limit_error: too many requests",
    "HTTP 429 Too Many Requests",
    "Your credit balance is too low to access the Anthropic API",
    "quota exceeded for this organisation",
    "401 Unauthorized",
    "OAuth token has expired",
    "Command `gh issue view 2609` exited with code 4: To get started with GitHub CLI, please run:  gh auth login",
  ])("stops the run on %s", (reason) => {
    expect(looksLikeTheRunBeingOver(reason)).toBe(true);
  });

  test.each([
    "Command failed (exit 128): git config --global --add safe.directory\nfatal: not a git repository",
    "docker: Cannot connect to the Docker daemon",
    "Error response from daemon: conflict: unable to delete container",
  ])("lets the run carry on after %s", (reason) => {
    expect(looksLikeTheRunBeingOver(reason)).toBe(false);
  });
});

describe("whenTheLimitLifts", () => {
  const at = (iso: string) => new Date(iso);

  test("reads the reset time claude code prints", () => {
    expect(
      whenTheLimitLifts(
        "claude-code exited with code 1:\nYou've hit your session limit · resets 9:20pm (UTC)",
        at("2026-09-27T18:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-27T21:20:00.000Z");
  });

  test("reads a reset time printed without minutes", () => {
    expect(
      whenTheLimitLifts(
        "claude-code exited with code 1:\nYou've hit your session limit · resets 10pm (UTC)",
        at("2026-09-30T21:40:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-30T22:00:00.000Z");
  });

  test("a reset time already past today is tomorrow's", () => {
    expect(
      whenTheLimitLifts(
        "You've hit your session limit · resets 2:00am (UTC)",
        at("2026-09-27T18:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-28T02:00:00.000Z");
  });

  test("midnight is the start of the day, not noon", () => {
    expect(
      whenTheLimitLifts(
        "You've hit your session limit · resets 12:00am (UTC)",
        at("2026-09-27T18:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-28T00:00:00.000Z");
  });

  test("noon is noon", () => {
    expect(
      whenTheLimitLifts(
        "You've hit your session limit · resets 12:30pm (UTC)",
        at("2026-09-27T06:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-27T12:30:00.000Z");
  });

  test("a limit with no reset time cannot be waited out", () => {
    expect(
      whenTheLimitLifts(
        "Claude AI usage limit reached",
        at("2026-09-27T18:00:00Z"),
      ),
    ).toBeNull();
  });

  test("a failure that is not a limit is not something to wait for", () => {
    expect(
      whenTheLimitLifts(
        "docker: Cannot connect to the Docker daemon",
        at("2026-09-27T18:00:00Z"),
      ),
    ).toBeNull();
  });
});

describe("waitOutALimit", () => {
  const SESSION_LIMIT =
    "claude-code exited with code 1:\nYou've hit your session limit · resets 10pm (UTC)";
  const clock = (iso: string) => {
    let now = new Date(iso).getTime();
    return {
      now: () => new Date(now),
      pause: async (ms: number) => {
        now += ms;
      },
    };
  };
  const failingThen = (failures: readonly string[]) => {
    let calls = 0;
    return {
      start: async () => {
        const failure = failures[calls];
        calls += 1;
        if (failure !== undefined) throw new Error(failure);
        return "ran";
      },
      calls: () => calls,
    };
  };

  test("a step stopped by a session limit waits for the reset and runs again", async () => {
    const step = failingThen([SESSION_LIMIT]);
    const { now, pause } = clock("2026-09-30T21:40:00Z");
    const waitedUntil: string[] = [];

    await expect(
      waitOutALimit(step.start, {
        now,
        pause,
        onWait: (lifts) => waitedUntil.push(lifts.toISOString()),
      }),
    ).resolves.toBe("ran");
    expect(step.calls()).toBe(2);
    expect(waitedUntil).toEqual(["2026-09-30T22:00:00.000Z"]);
    expect(now().getTime()).toBeGreaterThan(Date.parse("2026-09-30T22:00:00Z"));
  });

  test("the wait's length is reported, so a phase's duration can leave it out", async () => {
    const step = failingThen([SESSION_LIMIT]);
    const { now, pause } = clock("2026-09-30T21:40:00Z");
    const waited: number[] = [];

    await waitOutALimit(step.start, {
      now,
      pause,
      onWait: (_lifts, waitMs) => waited.push(waitMs),
    });

    expect(waited).toEqual([21 * 60_000]);
  });

  test.each([
    "Claude AI usage limit reached",
    "claude-code exited with code 1: You've hit your weekly limit · resets Oct 3, 10pm (UTC)",
    "docker: Cannot connect to the Docker daemon",
  ])("hands on at once what it cannot wait out: %s", async (failure) => {
    const step = failingThen([failure]);

    await expect(
      waitOutALimit(step.start, clock("2026-09-30T21:40:00Z")),
    ).rejects.toThrow(failure.split("\n")[0]);
    expect(step.calls()).toBe(1);
  });

  const MODEL_GONE =
    'claude-code exited with code 1:\n[claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}';

  test("a model the CLI stops recognising is the limit arriving, so the step is tried again every 15 minutes", async () => {
    const step = failingThen([MODEL_GONE, MODEL_GONE]);
    const { now, pause } = clock("2026-10-01T02:04:00Z");

    await expect(waitOutALimit(step.start, { now, pause })).resolves.toBe(
      "ran",
    );
    expect(step.calls()).toBe(3);
    expect(now().toISOString()).toBe("2026-10-01T02:34:00.000Z");
  });

  test("a model still missing after a whole session window is handed on", async () => {
    const step = failingThen(Array.from({ length: 100 }, () => MODEL_GONE));
    const { now, pause } = clock("2026-10-01T02:04:00Z");

    await expect(waitOutALimit(step.start, { now, pause })).rejects.toThrow(
      "unrecognized_model",
    );
    expect(now().getTime() - Date.parse("2026-10-01T02:04:00Z")).toBe(
      5 * 3_600_000,
    );
  });

  test("a limit that keeps coming back is handed on rather than waited for forever", async () => {
    const step = failingThen(Array.from({ length: 10 }, () => SESSION_LIMIT));

    await expect(
      waitOutALimit(step.start, clock("2026-09-30T21:40:00Z")),
    ).rejects.toThrow("session limit");
    expect(step.calls()).toBeLessThan(10);
  });
});

describe("retryWhatGitHubDropped", () => {
  const PUSH_REJECTED_BY_A_500 =
    "Command failed: git push --force-with-lease -u origin feat/x-2725\nremote: Internal Server Error\n ! [remote rejected] feat/x-2725 -> feat/x-2725 (Internal Server Error)";

  const failingThenSucceeding = (failures: readonly string[]) => {
    let calls = 0;
    return {
      attempt: async () => {
        const failure = failures[calls];
        calls += 1;
        if (failure !== undefined) throw new Error(failure);
        return "pushed";
      },
      calls: () => calls,
    };
  };

  test("a push GitHub answered with a 500 is tried again until it lands", async () => {
    const push = failingThenSucceeding([
      PUSH_REJECTED_BY_A_500,
      PUSH_REJECTED_BY_A_500,
    ]);
    const paused: number[] = [];

    await expect(
      retryWhatGitHubDropped(push.attempt, async (ms) => {
        paused.push(ms);
      }),
    ).resolves.toBe("pushed");
    expect(push.calls()).toBe(3);
    expect(paused).toHaveLength(2);
  });

  test.each([
    "The requested URL returned error: 502",
    "remote: fatal error in commit_refs (HTTP 503)",
    "fatal: unable to access 'https://github.com/o/r.git/': Could not resolve host: github.com",
    "error: RPC failed; curl 56 Recv failure: Connection reset by peer",
  ])("%s is worth another try", async (failure) => {
    const push = failingThenSucceeding([failure]);

    await expect(
      retryWhatGitHubDropped(push.attempt, async () => {}),
    ).resolves.toBe("pushed");
  });

  test("a push refused for its content fails at once", async () => {
    const push = failingThenSucceeding([
      " ! [rejected] feat/x-2725 -> feat/x-2725 (stale info)",
    ]);

    await expect(
      retryWhatGitHubDropped(push.attempt, async () => {}),
    ).rejects.toThrow("stale info");
    expect(push.calls()).toBe(1);
  });

  test("GitHub still failing after the last pause is reported", async () => {
    const push = failingThenSucceeding(
      Array.from({ length: 10 }, () => PUSH_REJECTED_BY_A_500),
    );

    await expect(
      retryWhatGitHubDropped(push.attempt, async () => {}),
    ).rejects.toThrow("Internal Server Error");
    expect(push.calls()).toBeLessThan(10);
  });
});
