import type { ResolvedContributions } from "./contributions.js";
import type { Selection } from "./types.js";
import { mergeImports } from "./imports.js";
import { fillProjectName, SECRETS_FILE_TOKEN } from "./types.js";

export function assembleConfig(
  selection: Selection,
  { imports, configSlots, registrations, envVars }: ResolvedContributions,
): string {
  const { projectName, runtime, authMethods } = selection;
  const fill = (value: string): string =>
    fillProjectName(value, projectName).replaceAll(
      SECRETS_FILE_TOKEN,
      runtime.secretsFile,
    );

  // The core imports are merged in with everything else so an auth method's
  // `github` folds into the one `from "plumix/auth"` line and its
  // `consoleMailer` into the one `from "plumix"` line.
  const authImports = authMethods.flatMap((method) => method.imports ?? []);
  const importLines = mergeImports(
    [
      ...imports,
      ...authImports,
      'import { auth } from "plumix/auth";',
      'import { plumix, type OAuthProvidersOf } from "plumix";',
    ].map(fill),
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
    ...(method.comment ? [`    // ${fill(method.comment)}`] : []),
    `    ${fill(method.authEntry)},`,
  ]);

  const pluginsBlock = registrations.length
    ? [
        "  plugins: [",
        ...registrations.map((registration) => `    ${fill(registration)},`),
        "  ],",
      ]
    : ["  plugins: [],"];

  // A method's `(env) => ...` secret resolver needs its bindings declared, or
  // the config won't type-check.
  const envComment = envVars.length
    ? [
        `// Secret bindings — set them in ${runtime.secretsFile} locally and as secrets on the`,
        "// deploy in production. Declared so the (env) => ... resolvers type.",
      ]
    : [];
  const envBindings = envVars.length
    ? [
        "  interface PlumixEnv {",
        ...envVars.map((name) => `    readonly ${name}: string;`),
        "  }",
      ]
    : [];

  return `${[
    ...importLines,
    "",
    'import { theme } from "./theme";',
    "",
    "const config = plumix({",
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
    "",
    "export default config;",
    "",
    ...envComment,
    'declare module "plumix" {',
    ...envBindings,
    "  // Types `authClient.signIn.oauth`'s provider from the config above, so a",
    "  // provider added there needs no edit here.",
    "  interface OAuthProviderRegistry extends OAuthProvidersOf<typeof config> {}",
    "}",
  ].join("\n")}\n`;
}
