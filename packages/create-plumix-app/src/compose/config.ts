import type { ResolvedContributions } from "./contributions.js";
import type { Selection } from "./types.js";
import { mergeImports } from "./imports.js";
import { fillProjectName } from "./types.js";

/**
 * Assemble the project's `plumix.config.ts` by splicing the runtime's,
 * capabilities', and plugins' imports, slots, and registrations into a
 * fixed shell. This is the one file whose structure varies with the
 * selection, so it is built from descriptor strings rather than copied.
 * Contributions are resolved once by the caller and threaded in.
 */
export function assembleConfig(
  selection: Selection,
  { imports, configSlots, registrations }: ResolvedContributions,
): string {
  const { projectName, runtime } = selection;
  const fill = (value: string): string => fillProjectName(value, projectName);

  const importLines = mergeImports(imports.map(fill));
  const slotLines = Object.entries(configSlots).map(
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

  const pluginsBlock = registrations.length
    ? [
        "  plugins: [",
        ...registrations.map((registration) => `    ${fill(registration)},`),
        "  ],",
      ]
    : ["  plugins: [],"];

  return `${[
    ...importLines,
    'import { auth, plumix } from "plumix";',
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
    "  }),",
    ...pluginsBlock,
    "  theme,",
    "});",
  ].join("\n")}\n`;
}
