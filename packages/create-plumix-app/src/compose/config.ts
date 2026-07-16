import type { ResolvedContributions } from "./contributions.js";
import type { Selection } from "./types.js";
import { mergeImports } from "./imports.js";
import { fillProjectName } from "./types.js";

/**
 * Assemble the project's `plumix.config.ts` by splicing the runtime's,
 * capabilities', plugins', and auth methods' imports, slots, and entries
 * into a fixed shell. This is the one file whose structure varies with the
 * selection, so it is built from descriptor strings rather than copied.
 * Contributions are resolved once by the caller and threaded in.
 */
export function assembleConfig(
  selection: Selection,
  { imports, configSlots, registrations }: ResolvedContributions,
): string {
  const { projectName, runtime, authMethods } = selection;
  const fill = (value: string): string => fillProjectName(value, projectName);

  // The core `plumix` import is merged in with everything else so an auth
  // method's `github`/`consoleMailer` folds into the one `from "plumix"` line.
  const authImports = authMethods.flatMap((method) => method.imports ?? []);
  const importLines = mergeImports(
    [...imports, ...authImports, 'import { auth, plumix } from "plumix";'].map(
      fill,
    ),
  );

  const slots = { ...configSlots };
  for (const method of authMethods) Object.assign(slots, method.configSlots);
  const slotLines = Object.entries(slots).map(
    ([slot, expr]) => `  ${slot}: ${fill(expr)},`,
  );

  const authOriginLines = runtime.authOrigin
    ? [
        ...(runtime.authOriginComment
          ? [`      // ${runtime.authOriginComment}`]
          : []),
        `      ${fill(runtime.authOrigin)},`,
      ]
    : [];

  const authMethodLines = authMethods.flatMap((method) => [
    ...(method.comment ? [`    // ${method.comment}`] : []),
    `    ${fill(method.authEntry)},`,
  ]);

  const pluginsBlock = registrations.length
    ? [
        "  plugins: [",
        ...registrations.map((registration) => `    ${fill(registration)},`),
        "  ],",
      ]
    : ["  plugins: [],"];

  // A method whose config uses an `(env) => ...` secret resolver needs those
  // bindings declared, or the config would not type-check. Dedup so two
  // methods sharing a secret don't declare it twice (a TS2300 error).
  const envVars = [
    ...new Set(authMethods.flatMap((method) => method.envVars ?? [])),
  ];
  const envAugmentation = envVars.length
    ? [
        "",
        "// Secret bindings — set them in .dev.vars locally and as wrangler",
        "// secrets in production. Declared so the (env) => ... resolvers type.",
        'declare module "plumix" {',
        "  interface PlumixEnv {",
        ...envVars.map((name) => `    readonly ${name}: string;`),
        "  }",
        "}",
      ]
    : [];

  return `${[
    ...importLines,
    "",
    'import { theme } from "./theme";',
    "",
    "export default plumix({",
    ...slotLines,
    "  auth: auth({",
    "    passkey: {",
    `      rpName: ${JSON.stringify(projectName)},`,
    ...authOriginLines,
    "    },",
    ...authMethodLines,
    "  }),",
    ...pluginsBlock,
    "  theme,",
    "});",
    ...envAugmentation,
  ].join("\n")}\n`;
}
