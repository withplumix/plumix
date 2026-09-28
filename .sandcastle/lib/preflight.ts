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

const resolveImage = (
  probe: Probe,
  image: string,
): { id: string } | { problem: string } => {
  const byTag = probe.run("docker", [
    "image",
    "inspect",
    image,
    "--format",
    "{{.Id}}",
  ]);
  if (byTag.exitCode === 0 && byTag.stdout.trim()) {
    return { id: byTag.stdout.trim() };
  }

  const listed = probe.run("docker", [
    "image",
    "ls",
    "--no-trunc",
    "--format",
    "{{.Repository}}:{{.Tag}} {{.ID}}",
  ]);
  if (listed.exitCode !== 0) {
    return {
      problem: "docker is not answering — start Docker Desktop and try again",
    };
  }
  const id = listed.stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find(([tag]) => tag === image)?.[1];
  return id
    ? { id }
    : {
        problem: `no sandbox image ${image} — run \`npx sandcastle docker build-image --dockerfile .sandcastle/Dockerfile\` from the repo root`,
      };
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

export const checkTheMachine = (
  probe: Probe,
  { repoRoot, envFile }: { repoRoot: string; envFile: string | null },
): { problems: readonly string[]; image?: string } => {
  const problems: string[] = [];
  const image = resolveImage(probe, sandboxImageName(repoRoot));
  if ("problem" in image) problems.push(image.problem);
  if (probe.run("gh", ["auth", "status"]).exitCode !== 0) {
    problems.push("gh on this machine is not logged in — run `gh auth login`");
  }
  problems.push(...credentialProblems(envFile));
  return "id" in image ? { problems, image: image.id } : { problems };
};

const hostProbe: Probe = {
  run: (command, args) => {
    const result = spawnSync(command, [...args], { encoding: "utf8" });
    return { exitCode: result.status ?? 1, stdout: result.stdout ?? "" };
  },
};

export const sandboxImageOrRefuse = (
  repoRoot: string,
  say: (line: string) => void,
): string | null => {
  const envPath = join(repoRoot, ".sandcastle", ".env");
  const { problems, image } = checkTheMachine(hostProbe, {
    repoRoot,
    envFile: existsSync(envPath) ? readFileSync(envPath, "utf8") : null,
  });
  if (problems.length === 0 && image) return image;
  say("Not starting — this machine cannot run a sandbox yet:");
  for (const problem of problems) say(`  - ${problem}`);
  return null;
};
