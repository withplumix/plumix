import { globSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** The umbrella's README is the repo's front page, not a card. */
const UMBRELLA = "plumix";

const INTERNAL = new Set([
  "@plumix/core",
  "@plumix/admin",
  "@plumix/admin-editor",
  "@plumix/admin-ui",
]);

const SCAFFOLDER = "create-plumix-app";

interface Manifest {
  readonly name: string;
  readonly private?: boolean;
  readonly description?: string;
  readonly homepage?: string;
}

export interface Card {
  readonly name: string;
  readonly dir: string;
  readonly description: string;
  readonly homepage: string;
}

export function publishedCards(): Card[] {
  return globSync("packages/**/package.json", {
    cwd: REPO_ROOT,
    exclude: (path) => path.includes("node_modules"),
  })
    .map((file) => {
      const path = join(REPO_ROOT, file);
      const manifest = JSON.parse(readFileSync(path, "utf8")) as Manifest;
      return { manifest, dir: dirname(path) };
    })
    .filter(
      ({ manifest }) => manifest.private !== true && manifest.name !== UMBRELLA,
    )
    .map(({ manifest, dir }) => ({
      name: manifest.name,
      dir,
      description: manifest.description ?? "",
      homepage: manifest.homepage ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const FOOTER = `## Support

Ask questions in [Discussions](https://github.com/withplumix/plumix/discussions) and report bugs in [Issues](https://github.com/withplumix/plumix/issues). Report a security issue privately, as the [security policy](https://github.com/withplumix/plumix/blob/main/SECURITY.md) describes.

## Contributing

Start with the [contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md).

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
`;

function body({ name, homepage }: Card): string {
  if (INTERNAL.has(name)) {
    return `This is an internal package of the Plumix framework. Projects depend on [\`plumix\`](https://www.npmjs.com/package/plumix), which re-exports it through stable subpaths.
`;
  }
  const command =
    name === SCAFFOLDER ? "pnpm create plumix-app" : `pnpm add ${name}`;
  const heading = name === SCAFFOLDER ? "Usage" : "Install";
  return `## ${heading}

\`\`\`bash
${command}
\`\`\`

## Documentation

Read the [documentation](${homepage}) on docs.plumix.dev.
`;
}

export function cardFor(card: Card): string {
  return `# ${card.name}

${card.description}

${body(card)}
${FOOTER}`;
}
