import { plugin as shadcn } from "@shadcn/lint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

import {
  NO_INTERNAL_MODULE_AUGMENTATION_SELECTOR,
  NO_THROW_NEW_ERROR_SELECTOR,
} from "./base.js";

const THEME_LAYOUT_UTILITIES = [
  "max-h-dialog",
  "max-h-sticky-panel",
  "h-editor-body",
  "grid-cols-media",
  "grid-cols-label-value",
  "aspect-og-card",
  "transition-width",
];

/**
 * Physical classes like `pl-4` don't flip under `dir="rtl"`. The left boundary
 * admits `:` because variant prefixes attach directly before the class.
 */
const PHYSICAL_CLASS_PATTERN =
  "(?:^|[\\s:])(?:" +
  // Segmented utilities with a trailing value.
  "-?(?:pl|pr|ml|mr|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br)-[\\w./[\\]()%,+*-]+" +
  "|-?(?:left|right)-[\\w./[\\]()%,+*-]+" +
  // Bare utilities with no trailing segment.
  "|(?:text-left|text-right|border-l|border-r)" +
  ")(?:\\s|$)";

const NO_PHYSICAL_CLASSES_SELECTOR = {
  selector: `JSXAttribute[name.name='className'] Literal[value=/${PHYSICAL_CLASS_PATTERN}/]`,
  message:
    "Physical CSS class — use a logical equivalent (`ps-*`/`pe-*`/`ms-*`/`me-*`/`start-*`/`end-*`/`text-start`/`text-end`/`border-s-*`/`border-e-*`/`rounded-s-*`/`rounded-e-*`) so RTL locales render correctly.",
} as const;

export const reactConfig = defineConfig(
  {
    files: ["**/*.ts", "**/*.tsx"],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat["jsx-runtime"],
    languageOptions: {
      ...reactPlugin.configs.flat.recommended?.languageOptions,
      ...reactPlugin.configs.flat["jsx-runtime"]?.languageOptions,
    },
  },
  reactHooks.configs.flat["recommended-latest"]!,
  // The preset ships these three as `warn`; a warning blocks nothing, so they
  // are errors like every other rule. Unscoped, like the preset itself.
  {
    rules: {
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/incompatible-library": "error",
      "react-hooks/unsupported-syntax": "error",
    },
  },
  // Layer the physical-class guard alongside the base config's
  // throw-new-error selector. Flat config replaces `no-restricted-syntax`
  // wholesale, so consumers that re-extend it must re-include both.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        NO_THROW_NEW_ERROR_SELECTOR,
        NO_PHYSICAL_CLASSES_SELECTOR,
        NO_INTERNAL_MODULE_AUGMENTATION_SELECTOR,
      ],
    },
  },
  // theme.css's layout utilities are named because plugins have no stylesheet
  // to discover them in. `no-restyle` allows sizing families by prefix: a
  // named entry warns where the theme is unseen.
  {
    files: ["src/**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    plugins: { shadcn },
    settings: {
      shadcn: {
        ui: ["@plumix/admin-ui", "plumix/admin/ui"],
        ignoreImports: ["/icons$"],
      },
    },
    rules: {
      "shadcn/no-raw-colors": "error",
      "shadcn/no-unknown-classes": [
        "error",
        { allow: ["plumix-*", "hljs", ...THEME_LAYOUT_UTILITIES] },
      ],
      "shadcn/no-restyle": [
        "error",
        {
          allow: ["layout", "max-h-*", "h-*"],
          contracts: [
            {
              pattern:
                "^(Card(Header|Content|Footer)|Field(Group|Set)?|DialogContent|SheetContent|PopoverContent|AccordionContent|RadioGroup)$",
              allow: [
                "layout",
                "max-h-*",
                "h-*",
                "gap-*",
                "gap-x-*",
                "gap-y-*",
                "space-x-*",
                "space-y-*",
              ],
            },
          ],
        },
      ],
      "shadcn/no-arbitrary-values": "error",
      "shadcn/no-inline-styles": "error",
      "shadcn/require-static-classes": "error",
    },
  },
  // Block renderers apply the styles an author set in the editor, and inline
  // styles are how those reach the rendered markup.
  {
    files: ["src/blocks/**/*.tsx"],
    rules: {
      "shadcn/no-inline-styles": "off",
    },
  },
);
