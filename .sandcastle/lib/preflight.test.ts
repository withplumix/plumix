import { describe, expect, test } from "vitest";

import type { Probe } from "./preflight.js";
import { problemsBeforeARun, sandboxImageName } from "./preflight.js";

const IMAGE = "sandcastle:t3code-7e461cfe";
const GOOD_ENV = "CLAUDE_CODE_OAUTH_TOKEN=tok\nGH_TOKEN=ghp\n";

const probe = (
  answers: Record<string, { exitCode: number; stdout?: string }>,
  ran: string[] = [],
): Probe => ({
  run: (command, args) => {
    const line = [command, ...args].join(" ");
    ran.push(line);
    const answer = Object.entries(answers).find(([prefix]) =>
      line.startsWith(prefix),
    )?.[1];
    return { exitCode: answer?.exitCode ?? 0, stdout: answer?.stdout ?? "" };
  },
});

const healthy = {
  [`docker image inspect ${IMAGE}`]: { exitCode: 0 },
  "gh auth status": { exitCode: 0 },
};

const check = (p: Probe, env: string | null = GOOD_ENV) =>
  problemsBeforeARun(p, { repoRoot: "/w/t3code-7e461cfe", envFile: env });

describe("sandboxImageName", () => {
  test("is the checkout's directory name, the way sandcastle names it", () => {
    expect(sandboxImageName("/Users/me/worktrees/T3code_7e461cfe/")).toBe(
      "sandcastle:t3code_7e461cfe",
    );
  });
});

describe("problemsBeforeARun", () => {
  test("a healthy machine has nothing to report", () => {
    expect(check(probe(healthy))).toEqual([]);
  });

  test("an image docker lists but cannot find by its tag is tagged again", () => {
    const ran: string[] = [];
    let tagged = false;
    const p: Probe = {
      run: (command, args) => {
        const line = [command, ...args].join(" ");
        ran.push(line);
        if (line.startsWith(`docker image inspect ${IMAGE}`))
          return { exitCode: tagged ? 0 : 1, stdout: "" };
        if (line.startsWith("docker image ls"))
          return {
            exitCode: 0,
            stdout: `${IMAGE} 15d4f126cc91\nother:x abc\n`,
          };
        if (line.startsWith("docker tag")) {
          tagged = true;
          return { exitCode: 0, stdout: "" };
        }
        return { exitCode: 0, stdout: "" };
      },
    };

    expect(check(p)).toEqual([]);
    expect(ran).toContain(`docker tag 15d4f126cc91 ${IMAGE}`);
  });

  test("a missing image says how to build it", () => {
    const problems = check(
      probe({
        ...healthy,
        [`docker image inspect ${IMAGE}`]: { exitCode: 1 },
        "docker image ls": { exitCode: 0, stdout: "other:x abc\n" },
      }),
    );

    expect(problems.join("\n")).toMatch(/sandcastle docker build-image/);
  });

  test("docker not answering is named as such", () => {
    const problems = check(
      probe({
        ...healthy,
        [`docker image inspect ${IMAGE}`]: { exitCode: 1 },
        "docker image ls": { exitCode: 1 },
      }),
    );

    expect(problems.join("\n")).toMatch(/docker/i);
  });

  test("a gh without a login is reported", () => {
    const problems = check(
      probe({ ...healthy, "gh auth status": { exitCode: 1 } }),
    );

    expect(problems.join("\n")).toMatch(/gh auth login/);
  });

  test.each([
    ["no .sandcastle/.env at all", null],
    ["no GitHub token", "CLAUDE_CODE_OAUTH_TOKEN=tok\nGH_TOKEN=\n"],
    ["no Claude credential", "GH_TOKEN=ghp\n# ANTHROPIC_API_KEY=\n"],
  ])("a sandbox with %s is reported", (_, env) => {
    expect(check(probe(healthy), env)).not.toEqual([]);
  });

  test("an API key stands in for the Claude token", () => {
    expect(
      check(probe(healthy), "ANTHROPIC_API_KEY=sk\nGH_TOKEN=ghp\n"),
    ).toEqual([]);
  });
});
