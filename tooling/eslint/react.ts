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

// Physical CSS classes don't auto-flip under `<html dir="rtl">`. `pl-4` stays
// padding-left in every locale, while `ps-4` resolves to start-side per
// direction. Universal RTL safety for any package emitting JSX.
//
// Variant prefixes (`sm:`, `hover:`, `dark:`, `group-data-[x]:`) attach
// directly before the class, so the left boundary admits `:` as well as
// whitespace. Bare utilities (`text-left`, `border-l`) split out so they
// don't require a trailing `-N` segment. Arbitrary values may contain
// parens / commas / spaces inside `[]` — the char class admits those.
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
  // Design-system rules for code composing `@plumix/admin-ui`. The primitives
  // themselves are exempt because admin-ui's own config ignores them.
  // A container's `gap-*` and `space-*` only space its children, so it
  // leaves the primitive's own look alone. `require-static-classes` keeps
  // every treatment where the other rules can read it: a variant or a
  // `data-*` state, never a class built at runtime.
  // `plumix-*` classes are the styling hooks public markup exposes to themes,
  // and `hljs` is highlight.js's, so neither is a Tailwind utility.
  // The layout utilities `@plumix/admin`'s theme.css declares are named for
  // `no-unknown-classes` because plugins have no stylesheet for it to discover
  // them in. `no-restyle` cannot tell what a declared utility changes, so the
  // sizing families that sit on primitives are allowed by prefix; a named
  // entry would warn in every package that cannot see the theme.
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
