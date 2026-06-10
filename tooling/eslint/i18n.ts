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
          // Entry / autosave state machine + manifest support flags.
          "^(saved|saving|live|none|autosave|draft|published|scheduled|private|revisions|edit-with-draft|trashed|inherit)$",
          // Plumix internal storage / version keys (`plumix.v2`,
          // `plumix.v2.draft.<slug>.<id>`).
          "^plumix\\.",
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
          // Capability identifiers — colon-namespaced lowercase tokens
          // passed to `hasCap` / `otherUserCap` and similar gates.
          // Matches `user:edit_own`, `entry:post:read`, etc.
          "^[a-z]+(:[a-z_]+)+$",
          // WebAuthn `AuthenticatorTransport` tokens from the W3C spec
          // — used as protocol discriminators in passkey UI (e.g.
          // `transports.includes("internal")`), never user copy.
          "^(internal|hybrid|usb|nfc|ble|smart-card)$",
          // Sort-stable Map-bucket sentinels — the rendered heading
          // for missing-category groups goes through a localized
          // `M.uncategorized` descriptor; the constant is only an
          // internal grouping key.
          "^(uncategorized|other)$",
          // Multi-token kebab identifiers — testid prefixes / suffixes
          // (`meta-box-field-`, `-input`), W3C input-type tokens
          // (`datetime-local`), capability segments. The trailing
          // hyphen variant covers template-literal quasi parts:
          // `\`meta-box-field-${field.key}\`` exposes `meta-box-field-`
          // as a quasi the rule sees as a bare literal.
          "^[a-z]+(-[a-z0-9]+)+-?$",
          "^-[a-z]+$",
          // Internal `__sentinel__` strings (e.g. unserializable-value
          // marker on a meta-field reset key).
          "^__[a-z_]+__$",
          // Plumix meta-box `inputType` discriminators — HTML5
          // baseline plus admin's custom input kinds (multiselect,
          // richtext, repeater, json) and the reference-target kinds
          // (user/entry/term/userList/entryList/termList). Used as
          // protocol values across the input dispatcher + registry,
          // never user copy.
          "^(text|password|email|url|number|tel|search|date|datetime|time|color|file|range|checkbox|radio|textarea|select|multiselect|richtext|repeater|json|user|entry|term|userList|entryList|termList)$",
          // Container-query Tailwind responsive variants used in the
          // meta-box grid dict — `@sm:col-span-N`, `@md:col-span-N`,
          // `@lg:col-span-N`. Pure CSS class tokens.
          "^@[a-z]+:col-span-(1[0-2]|[1-9])$",
          // Theme + sidebar / shadcn variant attribute values that
          // appear inside JSX prop expressions or top-level config:
          // `defaultTheme="system"`, `variant="inset"`, `collapsible="icon"`,
          // `orientation="vertical"`. The values themselves are
          // discriminators, not user copy.
          "^(system|inset|icon|vertical|horizontal)$",
          // Entry / autosave state machine extension — `stale` /
          // `fresh` autosave bucket, viewport size buckets (`small` /
          // `medium` / `large`), plus the SQL ordering pair (`asc` /
          // `desc`) used as RPC input discriminators.
          "^(stale|fresh|asc|desc|small|medium|large)$",
          // Single-token testid-prefix quasi parts (`puck-`,
          // `foo-` in `\`foo-${idx}\``).
          "^[a-z]+-$",
          // Entry status discriminator (`trash` for soft-deleted) —
          // sibling of the `trashed` token already covered.
          "^trash$",
          // Pattern-source slug fallback (lowercase URL component
          // in `starter/untitled`) — renders only into the generated
          // TS-source snippet the editor copies to the clipboard,
          // never to UI chrome. Title-cased `"Untitled"` stays
          // wrap-required since it's a real form-field placeholder
          // elsewhere.
          "^untitled$",
          // camelCase JS identifiers — registry kind names
          // (`registerPluginPage`), manifest section keys
          // (`entryTypes`, `settingsPages`), local variable / option
          // names. Real user copy never camelCases between words.
          "^[a-z]+([A-Z][a-z0-9]*)+$",
          // PascalCase `*Error` class identifiers — DOMException
          // names (`NotAllowedError`, `AbortError`) and admin's
          // own throwable classes used as error-code discriminators.
          "^[A-Z][a-zA-Z0-9]*Error$",
          // HTTP method discriminators in `fetch(...)` options.
          "^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$",
          // CSS class single-word tokens for the theme provider —
          // `"light"` / `"dark"` are CSS class identifiers used
          // alongside the system/inset/icon discriminator group.
          // Acceptable single-word ambiguity because the only
          // strict-default callsite is `root.classList.add("dark")`.
          "^(light|dark)$",
          // CSS media-query strings — bracketed expressions never
          // surface as user copy.
          "^\\([a-z-]+:\\s*[a-z-]+\\)$",
          // CSS attribute selectors (`script[data-plumix-plugin]`).
          "^[a-z][a-z0-9-]*\\[[a-z][a-z0-9-]*\\]$",
          // Same-origin fetch credentials discriminator.
          "^same-origin$",
          // URL scheme prefix used in `.startsWith("https://")` /
          // `"http://"` guards.
          "^https?://$",
          // Plumix manifest top-level section discriminators —
          // lowercase singletons that don't match the camelCase /
          // multi-token regexes above.
          "^(blocks|marks|patterns)$",
          // Magic-link wire-fallback code — `"network"` is the sole
          // lowercase singleton discriminator that lands in
          // `MagicLinkRequestError("network")` and the registry
          // fallback key.
          "^network$",
          // Generic snake_case wire identifiers — SQL column names
          // (`updated_at`), OAuth/RFC8628 response codes
          // (`access_denied`), passkey error reasons
          // (`user_cancelled`), plugin error names
          // (`duplicate_key`). Real user copy never has underscores
          // between words.
          "^[a-z]+(_[a-z]+)+$",
          // Block-name protocol values (`core/pattern-ref`,
          // `starter/<slug>`). Already partially covered by the
          // kebab regex above, but namespaced slug shapes need their
          // own anchor. Trailing-slash variant covers template-
          // literal quasi heads (`\`starter/${suffix}\`` joins to
          // `starter/`).
          "^[a-z]+/([a-z][a-z0-9-]*)?$",
          // Puck protocol zone identifier.
          "^root:default-zone$",
          // Capability template-literal quasi joins — `entry:` /
          // `user:` prefixes that appear when a template builds a
          // colon-namespaced capability or sort key. The rule joins
          // every quasi piece, so `\`entry:${x}:edit_own\`` becomes
          // `entry::edit_own` and `\`type:${x}:${y}\`` becomes
          // `type::`. Handles all shapes via colon-grouped suffixes.
          "^[a-z_]+(:+[a-z_]*)+$",
          // Internal sort key prefix from the revision diff helper.
          // `id:` and `type:` quasis are already covered by the
          // colon-namespaced regex above; `$$index:` needs its own
          // anchor.
          "^\\$\\$index:$",
          // Style-section discriminators in the editor StyleTab —
          // CSS property names used as picklist keys.
          "^(background|fontSize|padding|transform)$",
          // Puck slot key constant.
          "^content$",
          // Revision diff tab discriminators — picklist values for the
          // `defaultTab` prop on `RevisionDiffPanel`, never user copy.
          // (The visible tab labels are wrapped via `<Trans>`.)
          "^(visual|json)$",
          // Entry list valibot picklist values for sort-column
          // (`title` is the orderBy code) and author-filter (`mine`).
          // Visible column / option labels go through `M.columnTitle`
          // and `M.authorMine` respectively.
          "^mine$",
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
          // by primitives like `FormEditSkeleton`. `placeholderTestId`
          // is the analog on `LazyMount` for the pre-intersection
          // placeholder span.
          "testId",
          "placeholderTestId",
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
          // shadcn primitive discriminator props — value is a fixed
          // enum (`<ThemeProvider defaultTheme="system">`,
          // `<Sidebar collapsible="icon">`, `<Separator
          // orientation="vertical">`, `<Tabs defaultValue="blocks">`,
          // `<Sheet triggerSide="left">`). Never user copy.
          "defaultTheme",
          "collapsible",
          "orientation",
          "defaultValue",
          "triggerSide",
          // StyleTab section dispatcher — `property="background"`
          // selects which CSS prop the section edits.
          "property",
          // `coreIcon` selects a built-in admin glyph (`CoreIconName`
          // discriminator on nav items / palette commands), never copy.
          "coreIcon",
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
          "mode",
          "scope",
          "displayName",
          "$$typeof",
          // Tanstack query / router / table
          "queryKey",
          "accessorKey",
          // Sortable-header column-id prop value (e.g.
          // `<SortableHeader column="title">`). The column id is the
          // picklist key, not the visible label.
          "column",
          // JSX `value` is the state-bound input/option value — string
          // literals here are picklist discriminators (`<option value="inherit">`),
          // never user copy.
          "value",
          // RHF field-path prefix forwarded by metabox / form-section
          // primitives.
          "basePath",
          // Brand constants used as document-title suffix. Localizing
          // the product name is out of scope.
          "TITLE_BRAND",
          // ARIA: real labels should be translated, but `ariaLabel` is
          // also used for non-i18n SVG accessibility hints — defer to
          // case-by-case enablement later.
          "ariaLabel",
        ],
        ignoreFunctions: [
          // Tailwind class composition — `cn(...)` arguments are
          // always class strings, never user copy.
          "cn",
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
          // `window.open(url, target, features)` — all args are protocol
          // values (URL, "_blank", "noopener"), never UI copy.
          "window.open",
          // DOM queries — id / selector args, never user copy.
          "document.getElementById",
          "document.querySelectorAll",
          // Capability + auth — `capabilities.has("entry:post:edit_any")`
          // is a Set lookup; `hasCap` is the React hook variant.
          "hasCap",
          "capabilities.has",
          // Vitest mock helper — first arg is the global name to stub.
          "vi.stubGlobal",
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
          // valibot vMessage: argument is a `MessageDescriptor` literal
          // whose `message` field is the source-locale fallback.
          "vMessage",
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
