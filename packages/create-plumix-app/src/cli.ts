import { scaffold } from "./scaffold.js";

export interface CliIO {
  stdout(line: string): void;
  stderr(line: string): void;
}

const USAGE = `Usage: create-plumix-app <target-directory>

Scaffold a new Plumix project into <target-directory>. The directory
must not exist (or must be empty); its parent must exist.

Example:
  pnpm create plumix-app my-blog
  cd my-blog
  pnpm install
  pnpm dev`;

export async function runCli(
  argv: readonly string[],
  io: CliIO,
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }

  const positional = argv.filter((arg) => !arg.startsWith("-"));
  const target = positional[0];
  if (target === undefined) {
    io.stderr(USAGE);
    return 1;
  }

  try {
    const result = await scaffold({ targetDir: target });
    io.stdout(`Created ${result.name} at ${result.targetDir}.`);
    io.stdout("");
    io.stdout("Next steps:");
    io.stdout(`  cd ${result.name}`);
    io.stdout("  pnpm install");
    io.stdout("  pnpm dev");
    return 0;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
