import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

import { NO_THROW_NEW_ERROR_SELECTOR } from "./base.js";

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
      ],
    },
  },
);
