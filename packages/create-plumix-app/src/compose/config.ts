import type { Selection } from "./types.js";
import { fillProjectName } from "./types.js";

/**
 * Assemble the project's `plumix.config.ts` by splicing the runtime's
 * imports and slots and the selected plugins' registrations into a fixed
 * shell. This is the one file whose structure varies with the selection,
 * so it is built from descriptor strings rather than copied.
 */
export function assembleConfig(selection: Selection): string {
  const { projectName, runtime, plugins } = selection;
  const fill = (value: string): string => fillProjectName(value, projectName);

  const slotLines = Object.entries(runtime.configSlots).map(
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

  const pluginsBlock = plugins.length
    ? [
        "  plugins: [",
        ...plugins.map((plugin) => `    ${fill(plugin.registration)},`),
        "  ],",
      ]
    : ["  plugins: [],"];

  return `${[
    ...runtime.imports.map(fill),
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
