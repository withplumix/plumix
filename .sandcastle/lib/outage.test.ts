import { describe, expect, test } from "vitest";

import { looksLikeTheRunBeingOver } from "./outage.js";

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
