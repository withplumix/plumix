import { describe, expect, test } from "vitest";

import { looksLikeTheRunBeingOver, whenTheLimitLifts } from "./outage.js";

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
