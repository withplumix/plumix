import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Probe {
  readonly run: (
    command: string,
    args: readonly string[],
  ) => { exitCode: number; stdout: string };
}

export const sandboxImageName = (repoDir: string): string => {
  const directory =
    repoDir
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() ?? "local";
  const sanitized = directory.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  return `sandcastle:${sanitized || "local"}`;
};

const imageProblem = (probe: Probe, image: string): string | null => {
  const resolvesByTag = () =>
    probe.run("docker", ["image", "inspect", image, "--format", "{{.Id}}"])
      .exitCode === 0;
  if (resolvesByTag()) return null;

  const listed = probe.run("docker", [
    "image",
    "ls",
    "--format",
    "{{.Repository}}:{{.Tag}} {{.ID}}",
  ]);
  if (listed.exitCode !== 0) {
    return "docker is not answering — start Docker Desktop and try again";
  }
  const id = listed.stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find(([tag]) => tag === image)?.[1];
  if (id) {
    probe.run("docker", ["tag", id, image]);
    if (resolvesByTag()) return null;
  }
  return `no sandbox image ${image} — run \`npx sandcastle docker build-image --dockerfile .sandcastle/Dockerfile\` from the repo root`;
};

const envValues = (envFile: string): Map<string, string> =>
  new Map(
    envFile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const [key = "", ...value] = line.split("=");
        return [key.trim(), value.join("=").trim()] as const;
      }),
  );

const credentialProblems = (envFile: string | null): readonly string[] => {
  if (envFile === null) {
    return [
      "no .sandcastle/.env — copy .sandcastle/.env.example and fill it in",
    ];
  }
  const values = envValues(envFile);
  const problems: string[] = [];
  if (!values.get("GH_TOKEN"))
    problems.push("GH_TOKEN is empty in .sandcastle/.env");
  if (
    !values.get("CLAUDE_CODE_OAUTH_TOKEN") &&
    !values.get("ANTHROPIC_API_KEY")
  ) {
    problems.push(
      "neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY is set in .sandcastle/.env",
    );
  }
  return problems;
};

export const problemsBeforeARun = (
  probe: Probe,
  { repoRoot, envFile }: { repoRoot: string; envFile: string | null },
): readonly string[] => {
  const problems: string[] = [];
  const image = imageProblem(probe, sandboxImageName(repoRoot));
  if (image) problems.push(image);
  if (probe.run("gh", ["auth", "status"]).exitCode !== 0) {
    problems.push("gh on this machine is not logged in — run `gh auth login`");
  }
  problems.push(...credentialProblems(envFile));
  return problems;
};

const hostProbe: Probe = {
  run: (command, args) => {
    const result = spawnSync(command, [...args], { encoding: "utf8" });
    return { exitCode: result.status ?? 1, stdout: result.stdout ?? "" };
  },
};

export const refuseToStartOnABrokenMachine = (
  repoRoot: string,
  say: (line: string) => void,
): boolean => {
  const envPath = join(repoRoot, ".sandcastle", ".env");
  const problems = problemsBeforeARun(hostProbe, {
    repoRoot,
    envFile: existsSync(envPath) ? readFileSync(envPath, "utf8") : null,
  });
  if (problems.length === 0) return false;
  say("Not starting — this machine cannot run a sandbox yet:");
  for (const problem of problems) say(`  - ${problem}`);
  return true;
};
