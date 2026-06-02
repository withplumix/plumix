import type { Linter } from "eslint";
import pluginLingui from "eslint-plugin-lingui";
import { defineConfig } from "eslint/config";

/**
 * Lingui macro-misuse rules. Opt-in for packages that render admin UI
 * (admin itself + plugins with admin chunks). Complements `plumix
 * i18n extract --check` (slice 7): the gate catches drift in wrapped
 * strings; these rules catch extractor-breaking shapes (empty
 * msgids, expressions inside messages, module-scope `t` calls).
 *
 * `no-unlocalized-strings` lives in `i18nStrictConfig` below — opt
 * into that once a package's chrome is fully wrapped.
 */
export const i18nConfig = defineConfig({
  files: ["**/src/**/*.{ts,tsx}"],
  extends: [pluginLingui.configs["flat/recommended"]],
  rules: {
    // Plugin defaults are `warn` for these four (`t-call-in-function`
    // is already `error`). Promote to `error` so extractor-breaking
    // shapes block CI like every other lint failure.
    "lingui/no-trans-inside-trans": "error",
    "lingui/no-expression-in-message": "error",
    "lingui/no-single-variables-to-translate": "error",
    "lingui/no-single-tag-to-translate": "error",
  },
});

/**
 * Overrides that enable `no-unlocalized-strings`. Spread into a flat-
 * config block alongside `files: [...]` to scope strict mode to a
 * specific ratchet list — see `packages/admin/eslint.config.ts`.
 *
 * The allowlist covers attribute / function call sites whose string-
 * literal arguments are non-user-facing identifiers (test ids, route
 * paths, validator constants, error discriminators) — authored
 * empirically against admin's real source.
 */
export const i18nStrictOverrides: Linter.Config = {
  rules: {
    "lingui/no-unlocalized-strings": [
      "error",
      {
        // Regex matchers against the literal string content. The
        // plugin's built-in `/^[^\p{L}]+$/u` already covers pure
        // punctuation — don't restate it here.
        ignore: [
          // BCP-47 locale codes: "en", "de", "en-US", "zh-CN", etc.
          "^[a-z]{2,3}(-[A-Z][a-zA-Z0-9]+)*$",
          // Filesystem paths / globs (relative + absolute + bare).
          "^[./]",
          "^/",
          "\\.(mjs|js|ts|tsx|json|po|css|svg)$",
          // Intl / form-mode / RHF enum values that real user-facing
          // copy would never be.
          "^(auto|always|never|short|medium|long|full|narrow|onBlur|onChange|onSubmit|onTouched|manual)$",
          // Error / loading discriminator codes returned from async
          // mutations (passkey errors, query states, etc.).
          "^(unknown|pending|idle|loading|success|error)$",
          // User-role identifiers (valibot picklist discriminators) —
          // matches `UserRole` from `@plumix/core/schema`. The role's
          // display label lives in a separate `MessageDescriptor`.
          "^(subscriber|contributor|author|editor|admin)$",
          // shadcn primitive variant values used everywhere as
          // attribute / record values: `<Badge variant="outline">`,
          // `Record<Role, "default" | "secondary" | …>`. The `variant`
          // attribute itself is in `ignoreNames`, but values inside a
          // record literal need a content match.
          "^(default|secondary|outline|ghost|destructive|link)$",
        ],
        // Bare strings compile via `new RegExp(s)`; the `{regex:{pattern,flags?}}`
        // form is required only when flags are needed. Most entries are
        // exact-match names, so plain strings are fine.
        ignoreNames: [
          // Markup attribute namespaces (data-*, aria-*) — regex form
          // so future shadcn upgrades don't add new entries here.
          { regex: { pattern: "^data-" } },
          { regex: { pattern: "^aria-" } },
          // Admin convention: `testId` prop is forwarded to `data-testid`
          // by primitives like `FormEditSkeleton`.
          "testId",
          "type",
          "role",
          "name",
          "id",
          "key",
          "htmlFor",
          "to",
          "href",
          "src",
          "alt",
          "method",
          "encType",
          "target",
          "rel",
          "autoComplete",
          "autoCapitalize",
          "inputMode",
          "tabIndex",
          "className",
          "class",
          "style",
          "variant",
          "size",
          "color",
          "fill",
          "stroke",
          "viewBox",
          "xmlns",
          "d",
          "fontFamily",
          "fontVariant",
          "side",
          "align",
          "placement",
          "as",
          "asChild",
          // Internal identifiers / discriminators
          "status",
          "code",
          "slug",
          "kind",
          "scope",
          "displayName",
          "$$typeof",
          // Tanstack query / router / table
          "queryKey",
          "accessorKey",
          // JSX `value` is the state-bound input/option value — string
          // literals here are picklist discriminators (`<option value="inherit">`),
          // never user copy.
          "value",
          // Brand constants used as document-title suffix. Localizing
          // the product name is out of scope.
          "TITLE_BRAND",
          // ARIA: real labels should be translated, but `ariaLabel` is
          // also used for non-i18n SVG accessibility hints — defer to
          // case-by-case enablement later.
          "ariaLabel",
        ],
        ignoreFunctions: [
          // Validators
          "v.picklist",
          "v.literal",
          "v.string",
          "v.array",
          "v.object",
          "v.pipe",
          "v.parse",
          "v.safeParse",
          "v.union",
          "v.optional",
          "v.boolean",
          "v.number",
          "v.record",
          "v.looseObject",
          "v.email",
          "v.minLength",
          "v.maxLength",
          "v.trim",
          "v.toLowerCase",
          "v.transform",
          "v.fallback",
          "v.integer",
          "v.minValue",
          "v.maxValue",
          // Route definition
          "createFileRoute",
          "createRootRouteWithContext",
          // React / TanStack hooks (their string args are query keys
          // / context names, not user-facing)
          "useQuery",
          "useMutation",
          "useSuspenseQuery",
          "useInfiniteQuery",
          // Logging
          "console.log",
          "console.warn",
          "console.error",
          "console.info",
          "console.debug",
          // Native error constructors
          "Error",
          "TypeError",
          "RangeError",
          // URLs / browser APIs
          "URL",
          "URLSearchParams",
          "Symbol",
          "fetch",
          // DOM queries — id / selector args, never user copy.
          "document.getElementById",
          "document.querySelectorAll",
          // Capability + auth
          "hasCap",
          // Routing actions
          "redirect",
          "notFound",
          // React Hook Form: string args are field paths, not user copy.
          "form.getValues",
          "form.setValue",
          "form.watch",
          "form.trigger",
          "form.resetField",
          "form.getFieldState",
          // i18n: descriptor factory + imperative-with-fallback form.
          // `i18n._(id, values, { message })` is the canonical runtime
          // API; the `message` fallback is extracted by `lingui extract`.
          "defineMessage",
          "i18n._",
        ],
      },
    ],
  },
};

/**
 * Strict superset: macro-misuse rules + `no-unlocalized-strings`.
 * Opt into per-package once that package's chrome is fully wrapped.
 */
export const i18nStrictConfig = defineConfig(i18nConfig, {
  files: ["**/src/**/*.{ts,tsx}"],
  ...i18nStrictOverrides,
});
