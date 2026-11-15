import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { Executor } from "./gates.js";
import { REPO_ROOT } from "./repo.js";
import {
  declarationInPullRequest,
  declareVerification,
  parseVerification,
  publishedVerification,
  readVerificationTag,
  runDeclaredVerification,
  summaryLineOf,
  verificationForReview,
  withVerificationEvidence,
} from "./verify-admin.js";

const CLEAN_SUMMARY = [
  "Opening /users/create on core as editor…",
  "final URL  http://localhost:53709/_plumix/admin/users?page=1&role=all",
  "redirected /users/create → /users",
  "console    0 errors, 0 warnings",
  "requests   0 failed",
  "axe        0 violations",
  "steps      3 passed",
  "wrote      .cache/sandcastle/verify-admin/runs/1/{desktop-light.png,report.json}",
].join("\n");

/**
 * A git checkout in a temp folder where every command runs in a real shell,
 * except `pnpm`, which stands in for the build and for verify:admin.
 */
const checkout = ({
  failingRoute,
}: { readonly failingRoute?: string } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "verify-admin-"));
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "first",
  );
  const ran: string[] = [];
  const sandbox: Executor = {
    exec: async (command: string) => {
      ran.push(command);
      if (command.startsWith("pnpm verify:admin ")) {
        const out = command.match(/--out (\S+)$/)?.[1] ?? "";
        mkdirSync(join(dir, out), { recursive: true });
        for (const file of ["desktop-light.png", "phone-light.png"])
          writeFileSync(join(dir, out, file), "png");
        writeFileSync(join(dir, out, "report.json"), "{}");
        const failed = failingRoute && command.includes(failingRoute);
        return {
          exitCode: failed ? 1 : 0,
          stdout: CLEAN_SUMMARY,
          stderr: "",
          durationMs: 0,
        };
      }
      if (command.startsWith("pnpm "))
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
      const shell = spawnSync("sh", ["-c", command], {
        cwd: dir,
        encoding: "utf8",
      });
      return {
        exitCode: shell.status ?? 1,
        stdout: shell.stdout,
        stderr: shell.stderr,
        durationMs: 0,
      };
    },
  };
  const head = () => git("rev-parse", "HEAD").stdout.trim();
  const commit = () =>
    git(
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "next",
    );
  return { dir, sandbox, ran, head, commit };
};

const EDITOR_REFUSED =
  "pnpm verify:admin --site core --as editor --open /users/create --expect-route /users";
const ADMIN_REACHES =
  "pnpm verify:admin --site core --as admin --open /users/create";

describe("parseVerification", () => {
  test("reads one verify:admin command per line", () => {
    expect(
      parseVerification(`\n${EDITOR_REFUSED}\n\n${ADMIN_REACHES}\n`),
    ).toEqual({
      kind: "commands",
      commands: [EDITOR_REFUSED, ADMIN_REACHES],
    });
  });

  test("reads an opt-out with its reason", () => {
    expect(
      parseVerification(
        "none: a colour token changes; no page renders it differently",
      ),
    ).toEqual({
      kind: "none",
      reason: "a colour token changes; no page renders it differently",
    });
  });

  test("an opt-out without a reason is not one", () => {
    expect(parseVerification("none:").kind).toBe("invalid");
  });

  test("an empty block declares nothing", () => {
    expect(parseVerification("\n").kind).toBe("invalid");
  });

  test("a line that is not a verify:admin run is refused, so the gate cannot pass on another command", () => {
    expect(parseVerification("pnpm test")).toEqual({
      kind: "invalid",
      problem: expect.stringContaining("`pnpm test`"),
    });
  });

  test.each([
    `${ADMIN_REACHES} || true`,
    `${ADMIN_REACHES}; true`,
    `${ADMIN_REACHES} $(true)`,
    `${ADMIN_REACHES} > /dev/null`,
  ])("a command the shell would extend is refused: %s", (line) => {
    expect(parseVerification(line).kind).toBe("invalid");
  });

  test("a command that picks its own --out is refused, since the harness keeps the evidence", () => {
    expect(parseVerification(`${ADMIN_REACHES} --out /tmp/x`)).toEqual({
      kind: "invalid",
      problem: expect.stringContaining("--out"),
    });
  });
});

describe("readVerificationTag", () => {
  test("reads the block the implementer ends with", () => {
    expect(
      readVerificationTag(
        `done\n<verify-admin>\n${ADMIN_REACHES}\n</verify-admin>\n<pr>…</pr>`,
      ),
    ).toBe(ADMIN_REACHES);
  });

  test("an answer without the block declares nothing", () => {
    expect(readVerificationTag("done")).toBeNull();
  });
});

describe("summaryLineOf", () => {
  test("folds verify:admin's summary into one line, without the files it wrote", () => {
    expect(summaryLineOf(CLEAN_SUMMARY)).toBe(
      "final URL http://localhost:53709/_plumix/admin/users?page=1&role=all; redirected /users/create → /users; console 0 errors, 0 warnings; requests 0 failed; axe 0 violations; steps 3 passed",
    );
  });

  test("a run that printed no summary says so", () => {
    expect(summaryLineOf('No playground named "nope".')).toBe(
      "no summary printed",
    );
  });
});

describe("runDeclaredVerification", () => {
  test("an admin diff with no declared verification fails", async () => {
    const { sandbox } = checkout();

    const run = await runDeclaredVerification(sandbox);

    expect(run.exitCode).toBe(1);
    expect(run.output).toMatch(/declared no verification/);
  });

  test("an invalid declaration fails with what is wrong with it", async () => {
    const { sandbox } = checkout();
    await declareVerification(sandbox, "pnpm test");

    const run = await runDeclaredVerification(sandbox);

    expect(run.exitCode).toBe(1);
    expect(run.output).toContain("`pnpm test`");
  });

  test("runs each declared command after a build, with its output in the harness's folder", async () => {
    const { sandbox, ran } = checkout();
    await declareVerification(sandbox, `${EDITOR_REFUSED}\n${ADMIN_REACHES}`);

    const run = await runDeclaredVerification(sandbox);

    expect(run.exitCode).toBe(0);
    expect(ran.filter((command) => command.startsWith("pnpm "))).toEqual([
      "pnpm exec turbo run build --output-logs=errors-only",
      `${EDITOR_REFUSED} --out .cache/sandcastle/verify-admin/runs/1`,
      `${ADMIN_REACHES} --out .cache/sandcastle/verify-admin/runs/2`,
    ]);
    expect(run.artifacts).toBe(".cache/sandcastle/verify-admin");
  });

  test("a declared run that fails fails the gate, naming the command", async () => {
    const { sandbox } = checkout({ failingRoute: "--as editor" });
    await declareVerification(sandbox, `${EDITOR_REFUSED}\n${ADMIN_REACHES}`);

    const run = await runDeclaredVerification(sandbox);

    expect(run.exitCode).toBe(1);
    expect(run.output).toContain(`$ ${EDITOR_REFUSED}`);
    expect(run.output).not.toContain(`$ ${ADMIN_REACHES}`);
  });

  test("a declaration keeps its quotes intact on the way into the sandbox", async () => {
    const { sandbox } = checkout();
    await declareVerification(
      sandbox,
      "none: the token isn't rendered anywhere",
    );

    const run = await runDeclaredVerification(sandbox);

    expect(run).toEqual({
      exitCode: 0,
      output: "No verify:admin run: the token isn't rendered anywhere",
      artifacts: ".cache/sandcastle/verify-admin",
    });
  });

  test("a run from an earlier commit is gone once the gate starts again", async () => {
    const { dir, sandbox } = checkout();
    await declareVerification(sandbox, ADMIN_REACHES);
    await runDeclaredVerification(sandbox);
    await declareVerification(sandbox, "none: reverted the admin change");

    await runDeclaredVerification(sandbox);

    expect(existsSync(join(dir, ".cache/sandcastle/verify-admin/runs"))).toBe(
      false,
    );
  });
});

describe("the evidence of a verification", () => {
  test("covers the commit the declared commands ran on, and no later one", async () => {
    const { sandbox, commit } = checkout();
    await declareVerification(sandbox, ADMIN_REACHES);
    await runDeclaredVerification(sandbox);
    expect(await publishedVerification(sandbox)).not.toBeNull();

    commit();

    expect(await publishedVerification(sandbox)).toBeNull();
  });

  test("hands the review each run's report and screenshots", async () => {
    const { sandbox, head } = checkout();
    await declareVerification(sandbox, ADMIN_REACHES);
    await runDeclaredVerification(sandbox);

    const forReview = await verificationForReview(sandbox);

    expect(forReview).toContain(head());
    expect(forReview).toContain(`\`${ADMIN_REACHES}\``);
    expect(forReview).toContain(
      "report: .cache/sandcastle/verify-admin/runs/1/report.json",
    );
    expect(forReview).toContain(
      "screenshots: .cache/sandcastle/verify-admin/runs/1/desktop-light.png, .cache/sandcastle/verify-admin/runs/1/phone-light.png",
    );
  });

  test("before the harness runs them, the review reads what was declared", async () => {
    const { sandbox } = checkout();
    await declareVerification(sandbox, ADMIN_REACHES);

    expect(await verificationForReview(sandbox)).toContain(
      `\`${ADMIN_REACHES}\``,
    );
  });

  test("hands the review an opt-out's reason to judge", async () => {
    const { sandbox } = checkout();
    await declareVerification(sandbox, "none: a colour token changes");
    await runDeclaredVerification(sandbox);

    expect(await verificationForReview(sandbox)).toContain(
      "a colour token changes",
    );
  });

  test("a branch with nothing declared tells the review so", async () => {
    const { sandbox } = checkout();

    expect(await verificationForReview(sandbox)).toMatch(/No verify:admin run/);
  });
});

const BODY = `**Fixes #42**

## Summary

Editors no longer reach user creation.

## Evidence

The guard test failed, then passed.

## Merge Danger

**Door:** two-way.`;

describe("withVerificationEvidence", () => {
  const evidence = {
    head: "1a2b3c4d5e6f",
    declared: { kind: "commands" as const, commands: [ADMIN_REACHES] },
    runs: [
      {
        command: ADMIN_REACHES,
        exitCode: 0,
        summary:
          "final URL http://localhost:1/_plumix/admin/users/create; axe 0 violations",
        report: ".cache/sandcastle/verify-admin/runs/1/report.json",
        screenshots: [],
      },
    ],
  };

  test("lists each command and its summary at the end of the PR's Evidence", () => {
    const body = withVerificationEvidence(BODY, evidence);

    expect(body).toContain(
      `The guard test failed, then passed.\n\n<!-- verify-admin -->\n\`verify:admin\` on 1a2b3c4d5e6f, rerun by the harness:\n\n- \`${ADMIN_REACHES}\` — final URL http://localhost:1/_plumix/admin/users/create; axe 0 violations\n<!-- /verify-admin -->\n\n## Merge Danger`,
    );
  });

  test("states an opt-out and its reason", () => {
    const body = withVerificationEvidence(BODY, {
      head: "1a2b3c4d5e6f",
      declared: { kind: "none", reason: "a colour token changes" },
      runs: [],
    });

    expect(body).toContain(
      "<!-- verify-admin -->\n`verify:admin` not run: a colour token changes\n<!-- /verify-admin -->",
    );
  });

  test("replaces the evidence of an earlier commit instead of adding a second list", () => {
    const once = withVerificationEvidence(BODY, evidence);

    const twice = withVerificationEvidence(once, { ...evidence, head: "ffff" });

    expect(twice.match(/<!-- verify-admin -->/g)).toHaveLength(1);
    expect(twice).toContain("on ffff,");
  });

  test("removes stale evidence when this commit has none", () => {
    const once = withVerificationEvidence(BODY, evidence);

    expect(withVerificationEvidence(once, null)).toBe(BODY);
  });

  test("a body without an Evidence section gets the list at its end", () => {
    expect(withVerificationEvidence("**Fixes #42**", evidence)).toMatch(
      /^\*\*Fixes #42\*\*\n\n<!-- verify-admin -->[\s\S]*<!-- \/verify-admin -->$/,
    );
  });
});

describe("declarationInPullRequest", () => {
  test("a repair declares the commands its pull request lists", () => {
    const body = withVerificationEvidence(BODY, {
      head: "1a2b3c4",
      declared: { kind: "commands", commands: [EDITOR_REFUSED, ADMIN_REACHES] },
      runs: [EDITOR_REFUSED, ADMIN_REACHES].map((command) => ({
        command,
        exitCode: 0,
        summary: "axe 0 violations",
        report: "",
        screenshots: [],
      })),
    });

    expect(declarationInPullRequest(body)).toBe(
      `${EDITOR_REFUSED}\n${ADMIN_REACHES}`,
    );
  });

  test("a repair keeps the opt-out its pull request states", () => {
    const body = withVerificationEvidence(BODY, {
      head: "1a2b3c4",
      declared: { kind: "none", reason: "a colour token changes" },
      runs: [],
    });

    expect(declarationInPullRequest(body)).toBe("none: a colour token changes");
  });

  test("a pull request without the list declares nothing", () => {
    expect(declarationInPullRequest(BODY)).toBeNull();
  });
});

describe("declareVerification", () => {
  test("writes the declaration where every later gate in this sandbox reads it", async () => {
    const { dir, sandbox } = checkout();

    await declareVerification(sandbox, ADMIN_REACHES);

    expect(
      readFileSync(
        join(dir, ".cache/sandcastle/verify-admin/declared.txt"),
        "utf8",
      ),
    ).toBe(`${ADMIN_REACHES}\n`);
  });

  test("keeps it in a folder git ignores, so a read-only phase still leaves the tree clean", () => {
    const ignored = spawnSync(
      "git",
      ["check-ignore", "-q", ".cache/sandcastle/verify-admin/declared.txt"],
      { cwd: REPO_ROOT },
    );

    expect(ignored.status).toBe(0);
  });
});
