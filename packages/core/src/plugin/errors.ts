type PluginContextErrorCode =
  | "duplicate_route"
  | "extend_context_invalid_key"
  | "extend_context_reserved_key"
  | "extend_app_context_builtin_collision"
  | "extend_context_duplicate"
  | "derived_capability_min_role_mismatch"
  | "settings_page_duplicate_group"
  | "plugin_id_collides_with_core_rpc_namespace"
  | "extension_shadows_builtin"
  | "invalid_component_ref"
  | "invalid_field_type_name"
  | "invalid_lookup_adapter_kind"
  | "invalid_scheduled_task_id"
  | "scheduled_task_handler_missing"
  | "invalid_login_link_key"
  | "login_link_empty_label"
  | "login_link_label_has_crlf"
  | "invalid_login_link_href"
  | "invalid_nav_group_id_length"
  | "invalid_nav_group_id_shape"
  | "path_must_start_with_slash"
  | "path_contains_traversal"
  | "path_contains_query_or_fragment"
  | "admin_page_path_contains_wildcard"
  | "route_path_wildcard_not_at_end"
  | "route_path_wildcard_not_after_slash"
  | "identifier_too_long"
  | "identifier_shape_invalid"
  | "meta_box_too_many_fields"
  | "meta_box_field_invalid_key"
  | "meta_box_field_duplicate_key";

interface PluginContextErrorFields {
  pluginId?: string;
  kind?: string;
  key?: string;
  path?: string;
  identifierName?: string;
  id?: string;
  type?: string;
  href?: string;
  descriptor?: string;
  existingOwner?: string;
  capName?: string;
  minRole?: string;
  existingMinRole?: string;
  fieldKey?: string;
  pattern?: string;
  count?: number;
  maxLength?: number;
  maxFields?: number;
  coreNamespaces?: readonly string[];
}

export class PluginContextError extends Error {
  static {
    PluginContextError.prototype.name = "PluginContextError";
  }

  readonly code: PluginContextErrorCode;
  readonly pluginId: string | undefined;
  readonly kind: string | undefined;
  readonly key: string | undefined;
  readonly path: string | undefined;
  readonly identifierName: string | undefined;
  readonly id: string | undefined;
  readonly type: string | undefined;
  readonly href: string | undefined;
  readonly descriptor: string | undefined;
  readonly existingOwner: string | undefined;
  readonly capName: string | undefined;
  readonly minRole: string | undefined;
  readonly existingMinRole: string | undefined;
  readonly fieldKey: string | undefined;
  readonly pattern: string | undefined;
  readonly count: number | undefined;
  readonly maxLength: number | undefined;
  readonly maxFields: number | undefined;
  readonly coreNamespaces: readonly string[] | undefined;

  private constructor(
    code: PluginContextErrorCode,
    message: string,
    fields: PluginContextErrorFields,
  ) {
    super(message);
    this.code = code;
    this.pluginId = fields.pluginId;
    this.kind = fields.kind;
    this.key = fields.key;
    this.path = fields.path;
    this.identifierName = fields.identifierName;
    this.id = fields.id;
    this.type = fields.type;
    this.href = fields.href;
    this.descriptor = fields.descriptor;
    this.existingOwner = fields.existingOwner;
    this.capName = fields.capName;
    this.minRole = fields.minRole;
    this.existingMinRole = fields.existingMinRole;
    this.fieldKey = fields.fieldKey;
    this.pattern = fields.pattern;
    this.count = fields.count;
    this.maxLength = fields.maxLength;
    this.maxFields = fields.maxFields;
    this.coreNamespaces = fields.coreNamespaces;
  }

  static duplicateRoute(ctx: {
    pluginId: string;
    method: string;
    path: string;
  }): PluginContextError {
    return new PluginContextError(
      "duplicate_route",
      `Plugin "${ctx.pluginId}" already registered a route for ${ctx.method} ${ctx.path}.`,
      { pluginId: ctx.pluginId, kind: ctx.method, path: ctx.path },
    );
  }

  static extendContextInvalidKey(ctx: {
    pluginId: string;
    kind: "Plugin" | "Theme" | "App";
  }): PluginContextError {
    return new PluginContextError(
      "extend_context_invalid_key",
      `Plugin "${ctx.pluginId}" called extend${ctx.kind}Context with an ` +
        `invalid key — must be a non-empty string.`,
      ctx,
    );
  }

  static extendContextReservedKey(ctx: {
    pluginId: string;
    kind: "Plugin" | "Theme" | "App";
    key: string;
  }): PluginContextError {
    return new PluginContextError(
      "extend_context_reserved_key",
      `Plugin "${ctx.pluginId}" called extend${ctx.kind}Context with the ` +
        `reserved name "${ctx.key}". JS-builtins (\`__proto__\`, ` +
        `\`constructor\`, \`prototype\`) can't be used as extension ` +
        `keys — they would corrupt the per-request context object.`,
      ctx,
    );
  }

  static extendAppContextBuiltinCollision(ctx: {
    pluginId: string;
    key: string;
  }): PluginContextError {
    return new PluginContextError(
      "extend_app_context_builtin_collision",
      `Plugin "${ctx.pluginId}" called extendAppContext with "${ctx.key}", ` +
        `which collides with a built-in AppContext member. The ` +
        `dispatcher would overwrite the runtime field on every ` +
        `request — rename the extension to a plugin-scoped key.`,
      ctx,
    );
  }

  static extendContextDuplicate(ctx: {
    pluginId: string;
    kind: "Plugin" | "Theme" | "App";
    key: string;
    existingOwner: string;
  }): PluginContextError {
    return new PluginContextError(
      "extend_context_duplicate",
      `Plugin "${ctx.pluginId}" extended the ${ctx.kind.toLowerCase()} context ` +
        `with "${ctx.key}", but "${ctx.existingOwner}" already registered it. ` +
        `Each extension key has exactly one provider — rename one or ` +
        `consolidate the providing plugin.`,
      ctx,
    );
  }

  static derivedCapabilityMinRoleMismatch(ctx: {
    pluginId: string;
    capName: string;
    minRole: string;
    existingMinRole: string;
    existingOwner: string;
  }): PluginContextError {
    return new PluginContextError(
      "derived_capability_min_role_mismatch",
      `Plugin "${ctx.pluginId}" derived capability "${ctx.capName}" with ` +
        `minRole "${ctx.minRole}", but it was already registered ` +
        `with minRole "${ctx.existingMinRole}" by ` +
        `"${ctx.existingOwner}". Two entry types ` +
        `/ termTaxonomies sharing a capabilityType must agree on any ` +
        `\`capabilities\` override — the pool has one cap per name.`,
      ctx,
    );
  }

  static settingsPageDuplicateGroup(ctx: { name: string }): PluginContextError {
    return new PluginContextError(
      "settings_page_duplicate_group",
      `Settings page "${ctx.name}" lists a group more than once; ` +
        `each group may appear at most once per page.`,
      { identifierName: ctx.name },
    );
  }

  static pluginIdCollidesWithCoreRpcNamespace(ctx: {
    pluginId: string;
    coreNamespaces: readonly string[];
  }): PluginContextError {
    return new PluginContextError(
      "plugin_id_collides_with_core_rpc_namespace",
      `Plugin id "${ctx.pluginId}" collides with core RPC namespace. ` +
        `Rename the plugin — reserved names are: ` +
        `${[...ctx.coreNamespaces].sort().join(", ")}.`,
      ctx,
    );
  }

  static extensionShadowsBuiltin(ctx: { key: string }): PluginContextError {
    return new PluginContextError(
      "extension_shadows_builtin",
      `Plugin context extension key "${ctx.key}" collides with a built-in ` +
        `PluginSetupContext member. Rename the extension to avoid ` +
        `shadowing core registration APIs.`,
      ctx,
    );
  }

  static invalidComponentRef(ctx: {
    pluginId: string;
    descriptor: string;
  }): PluginContextError {
    return new PluginContextError(
      "invalid_component_ref",
      `Plugin "${ctx.pluginId}" registered ${ctx.descriptor} with an invalid ` +
        `component ref — must be a non-empty string naming the export on ` +
        `the plugin's adminEntry module (e.g. "MediaLibrary").`,
      ctx,
    );
  }

  static invalidFieldTypeName(ctx: {
    pluginId: string;
    type: string;
    pattern: string;
    maxLength: number;
  }): PluginContextError {
    return new PluginContextError(
      "invalid_field_type_name",
      `Plugin "${ctx.pluginId}" registered meta-box field type with invalid ` +
        `name "${ctx.type}" — must match /${ctx.pattern}/ and be at most ${String(ctx.maxLength)} ` +
        `characters.`,
      ctx,
    );
  }

  static invalidLookupAdapterKind(ctx: {
    pluginId: string;
    kind: string;
    pattern: string;
    maxLength: number;
  }): PluginContextError {
    return new PluginContextError(
      "invalid_lookup_adapter_kind",
      `Plugin "${ctx.pluginId}" registered lookup adapter with invalid ` +
        `kind "${ctx.kind}" — must match /${ctx.pattern}/ and be at most ${String(ctx.maxLength)} ` +
        `characters.`,
      ctx,
    );
  }

  static invalidScheduledTaskId(ctx: {
    pluginId: string;
    id: string;
  }): PluginContextError {
    return new PluginContextError(
      "invalid_scheduled_task_id",
      `Plugin "${ctx.pluginId}" registered a scheduled task with invalid id ` +
        `"${ctx.id}" — must be alphanum + dash/underscore/slash, 1..64 chars.`,
      ctx,
    );
  }

  static scheduledTaskHandlerMissing(ctx: {
    pluginId: string;
    id: string;
  }): PluginContextError {
    return new PluginContextError(
      "scheduled_task_handler_missing",
      `Plugin "${ctx.pluginId}" registered scheduled task "${ctx.id}" without ` +
        `a handler function.`,
      ctx,
    );
  }

  static invalidLoginLinkKey(ctx: {
    pluginId: string;
    key: string;
  }): PluginContextError {
    return new PluginContextError(
      "invalid_login_link_key",
      `Plugin "${ctx.pluginId}" registered a login link with invalid key ` +
        `"${ctx.key}" — must be lowercase alphanum + dash/underscore, ` +
        `1..32 chars.`,
      ctx,
    );
  }

  static loginLinkEmptyLabel(ctx: {
    pluginId: string;
    key: string;
  }): PluginContextError {
    return new PluginContextError(
      "login_link_empty_label",
      `Plugin "${ctx.pluginId}" registered login link "${ctx.key}" with ` +
        `an empty label.`,
      ctx,
    );
  }

  static loginLinkLabelHasCrLf(ctx: {
    pluginId: string;
    key: string;
  }): PluginContextError {
    return new PluginContextError(
      "login_link_label_has_crlf",
      `Plugin "${ctx.pluginId}" registered login link "${ctx.key}" with ` +
        `a label containing CR/LF.`,
      ctx,
    );
  }

  static invalidLoginLinkHref(ctx: {
    pluginId: string;
    key: string;
    href: string;
  }): PluginContextError {
    return new PluginContextError(
      "invalid_login_link_href",
      `Plugin "${ctx.pluginId}" registered login link "${ctx.key}" with ` +
        `href "${ctx.href}" — must start with "/" (same-origin path) ` +
        `or "https://".`,
      ctx,
    );
  }

  static invalidNavGroupIdLength(ctx: {
    pluginId: string;
    id: string;
    maxLength: number;
  }): PluginContextError {
    return new PluginContextError(
      "invalid_nav_group_id_length",
      `Plugin "${ctx.pluginId}" registered admin nav group with invalid id ` +
        `"${ctx.id}" — length must be 1..${String(ctx.maxLength)}.`,
      ctx,
    );
  }

  static invalidNavGroupIdShape(ctx: {
    pluginId: string;
    id: string;
    pattern: string;
  }): PluginContextError {
    return new PluginContextError(
      "invalid_nav_group_id_shape",
      `Plugin "${ctx.pluginId}" registered admin nav group with invalid id ` +
        `"${ctx.id}" — must match /${ctx.pattern}/.`,
      ctx,
    );
  }

  static pathMustStartWithSlash(ctx: {
    pluginId: string;
    kind: string;
    path: string;
  }): PluginContextError {
    return new PluginContextError(
      "path_must_start_with_slash",
      `Plugin "${ctx.pluginId}" ${ctx.kind} path "${ctx.path}" must start with "/".`,
      ctx,
    );
  }

  static pathContainsTraversal(ctx: {
    pluginId: string;
    kind: string;
    path: string;
  }): PluginContextError {
    return new PluginContextError(
      "path_contains_traversal",
      `Plugin "${ctx.pluginId}" ${ctx.kind} path "${ctx.path}" contains "//" or "..".`,
      ctx,
    );
  }

  static pathContainsQueryOrFragment(ctx: {
    pluginId: string;
    kind: string;
    path: string;
  }): PluginContextError {
    return new PluginContextError(
      "path_contains_query_or_fragment",
      `Plugin "${ctx.pluginId}" ${ctx.kind} path "${ctx.path}" must not include a query ` +
        `string or fragment — match on the pathname only.`,
      ctx,
    );
  }

  static adminPagePathContainsWildcard(ctx: {
    pluginId: string;
    path: string;
  }): PluginContextError {
    return new PluginContextError(
      "admin_page_path_contains_wildcard",
      `Plugin "${ctx.pluginId}" admin page path "${ctx.path}" must not contain "*" ` +
        `— register nested routes via TanStack Router children inside the ` +
        `page component rather than a wildcard suffix.`,
      ctx,
    );
  }

  static routePathWildcardNotAtEnd(ctx: {
    pluginId: string;
    path: string;
  }): PluginContextError {
    return new PluginContextError(
      "route_path_wildcard_not_at_end",
      `Plugin "${ctx.pluginId}" route path "${ctx.path}" may only contain "*" ` +
        `as a trailing wildcard (e.g. "/storage/*").`,
      ctx,
    );
  }

  static routePathWildcardNotAfterSlash(ctx: {
    pluginId: string;
    path: string;
  }): PluginContextError {
    return new PluginContextError(
      "route_path_wildcard_not_after_slash",
      `Plugin "${ctx.pluginId}" route path "${ctx.path}" must place the trailing ` +
        `wildcard after a "/" ("/prefix/*", not "/prefix*").`,
      ctx,
    );
  }

  static identifierTooLong(ctx: {
    kind: string;
    name: string;
    maxLength: number;
  }): PluginContextError {
    return new PluginContextError(
      "identifier_too_long",
      `Invalid ${ctx.kind} name "${ctx.name}" — names are capped at ` +
        `${String(ctx.maxLength)} characters to match the RPC ` +
        `input schema.`,
      {
        kind: ctx.kind,
        identifierName: ctx.name,
        maxLength: ctx.maxLength,
      },
    );
  }

  static identifierShapeInvalid(ctx: {
    kind: string;
    name: string;
    pattern: string;
  }): PluginContextError {
    return new PluginContextError(
      "identifier_shape_invalid",
      `Invalid ${ctx.kind} name "${ctx.name}" — expected lowercase ASCII ` +
        `/${ctx.pattern}/ so storage keys, testids, and URLs stay portable.`,
      {
        kind: ctx.kind,
        identifierName: ctx.name,
        pattern: ctx.pattern,
      },
    );
  }

  static metaBoxTooManyFields(ctx: {
    kind: string;
    id: string;
    count: number;
    maxFields: number;
  }): PluginContextError {
    return new PluginContextError(
      "meta_box_too_many_fields",
      `${ctx.kind} "${ctx.id}" declares ${String(ctx.count)} fields; the admin caps ` +
        `a single box at ${String(ctx.maxFields)}. Split into multiple boxes.`,
      ctx,
    );
  }

  static metaBoxFieldInvalidKey(ctx: {
    kind: string;
    id: string;
    fieldKey: string;
    pattern: string;
  }): PluginContextError {
    return new PluginContextError(
      "meta_box_field_invalid_key",
      `${ctx.kind} "${ctx.id}" declares field with invalid key "${ctx.fieldKey}" — ` +
        `meta keys must match /${ctx.pattern}/.`,
      ctx,
    );
  }

  static metaBoxFieldDuplicateKey(ctx: {
    kind: string;
    id: string;
    fieldKey: string;
  }): PluginContextError {
    return new PluginContextError(
      "meta_box_field_duplicate_key",
      `${ctx.kind} "${ctx.id}" declares field "${ctx.fieldKey}" more than once.`,
      ctx,
    );
  }
}

type PluginDefinitionErrorCode =
  | "invalid_plugin_id_length"
  | "invalid_plugin_id_shape"
  | "define_plugin_legacy_third_arg"
  | "duplicate_plugin_id_in_config"
  | "meta_field_clash_across_boxes"
  | "meta_box_references_unknown_scope"
  | "settings_page_references_unknown_group"
  | "admin_slug_derivation_failed"
  | "admin_manifest_placeholder_missing";

interface PluginDefinitionErrorFields {
  pluginId?: string;
  pluginIdMaxLength?: number;
  pattern?: string;
  kind?: string;
  fieldKey?: string;
  firstBoxId?: string;
  secondBoxId?: string;
  scope?: string;
  boxKind?: string;
  boxId?: string;
  scopeKind?: string;
  pageName?: string;
  groupName?: string;
  entryTypeName?: string;
  from?: string;
  scriptId?: string;
}

export class PluginDefinitionError extends Error {
  static {
    PluginDefinitionError.prototype.name = "PluginDefinitionError";
  }

  readonly code: PluginDefinitionErrorCode;
  readonly pluginId: string | undefined;
  readonly pluginIdMaxLength: number | undefined;
  readonly pattern: string | undefined;
  readonly kind: string | undefined;
  readonly fieldKey: string | undefined;
  readonly firstBoxId: string | undefined;
  readonly secondBoxId: string | undefined;
  readonly scope: string | undefined;
  readonly boxKind: string | undefined;
  readonly boxId: string | undefined;
  readonly scopeKind: string | undefined;
  readonly pageName: string | undefined;
  readonly groupName: string | undefined;
  readonly entryTypeName: string | undefined;
  readonly from: string | undefined;
  readonly scriptId: string | undefined;

  private constructor(
    code: PluginDefinitionErrorCode,
    message: string,
    fields: PluginDefinitionErrorFields,
  ) {
    super(message);
    this.code = code;
    this.pluginId = fields.pluginId;
    this.pluginIdMaxLength = fields.pluginIdMaxLength;
    this.pattern = fields.pattern;
    this.kind = fields.kind;
    this.fieldKey = fields.fieldKey;
    this.firstBoxId = fields.firstBoxId;
    this.secondBoxId = fields.secondBoxId;
    this.scope = fields.scope;
    this.boxKind = fields.boxKind;
    this.boxId = fields.boxId;
    this.scopeKind = fields.scopeKind;
    this.pageName = fields.pageName;
    this.groupName = fields.groupName;
    this.entryTypeName = fields.entryTypeName;
    this.from = fields.from;
    this.scriptId = fields.scriptId;
  }

  static invalidPluginIdLength(ctx: {
    pluginId: string;
    pluginIdMaxLength: number;
  }): PluginDefinitionError {
    return new PluginDefinitionError(
      "invalid_plugin_id_length",
      `Plugin id "${ctx.pluginId}" must be between 1 and ${String(ctx.pluginIdMaxLength)} ` +
        `characters.`,
      ctx,
    );
  }

  static invalidPluginIdShape(ctx: {
    pluginId: string;
    pattern: string;
  }): PluginDefinitionError {
    return new PluginDefinitionError(
      "invalid_plugin_id_shape",
      `Plugin id "${ctx.pluginId}" must match /${ctx.pattern}/ (lowercase ASCII ` +
        `starting with a letter; alphanumerics, hyphens, and underscores).`,
      ctx,
    );
  }

  static definePluginLegacyThirdArg(ctx: {
    pluginId: string;
  }): PluginDefinitionError {
    return new PluginDefinitionError(
      "define_plugin_legacy_third_arg",
      `definePlugin("${ctx.pluginId}", input) — pass options inside the input ` +
        `object (\`setup\`, \`provides\`, \`schema\`, ...) instead of the ` +
        `legacy third argument.`,
      ctx,
    );
  }

  static duplicatePluginIdInConfig(ctx: {
    pluginId: string;
  }): PluginDefinitionError {
    return new PluginDefinitionError(
      "duplicate_plugin_id_in_config",
      `Plugin id "${ctx.pluginId}" appears more than once in ` +
        `config.plugins — each plugin id must be unique.`,
      ctx,
    );
  }

  static metaFieldClashAcrossBoxes(ctx: {
    kind: string;
    fieldKey: string;
    firstBoxId: string;
    secondBoxId: string;
    scope: string;
  }): PluginDefinitionError {
    return new PluginDefinitionError(
      "meta_field_clash_across_boxes",
      `Meta field "${ctx.fieldKey}" is declared by ${ctx.kind} meta ` +
        `boxes "${ctx.firstBoxId}" and "${ctx.secondBoxId}" on the same scope ` +
        `"${ctx.scope}". Each key may appear in at most one box ` +
        `per scope.`,
      ctx,
    );
  }

  static metaBoxReferencesUnknownScope(ctx: {
    boxKind: string;
    boxId: string;
    scopeKind: string;
    scope: string;
  }): PluginDefinitionError {
    return new PluginDefinitionError(
      "meta_box_references_unknown_scope",
      `${ctx.boxKind} "${ctx.boxId}" references ${ctx.scopeKind} "${ctx.scope}" ` +
        `which hasn't been registered.`,
      ctx,
    );
  }

  static settingsPageReferencesUnknownGroup(ctx: {
    pageName: string;
    groupName: string;
  }): PluginDefinitionError {
    return new PluginDefinitionError(
      "settings_page_references_unknown_group",
      `Settings page "${ctx.pageName}" references group "${ctx.groupName}" ` +
        `which hasn't been registered. Call ` +
        `ctx.registerSettingsGroup("${ctx.groupName}", {...}) before the page.`,
      ctx,
    );
  }

  static adminSlugDerivationFailed(ctx: {
    entryTypeName: string;
    from: string;
  }): PluginDefinitionError {
    return new PluginDefinitionError(
      "admin_slug_derivation_failed",
      `Cannot derive an admin slug for post type "${ctx.entryTypeName}" from ${ctx.from} — result was empty.`,
      ctx,
    );
  }

  static adminManifestPlaceholderMissing(ctx: {
    scriptId: string;
  }): PluginDefinitionError {
    return new PluginDefinitionError(
      "admin_manifest_placeholder_missing",
      `Admin index.html is missing the <script id="${ctx.scriptId}"> ` +
        `placeholder. Rebuild @plumix/admin.`,
      ctx,
    );
  }
}

export class DuplicateRegistrationError extends Error {
  static {
    DuplicateRegistrationError.prototype.name = "DuplicateRegistrationError";
  }

  readonly kind: string;
  readonly identifier: string;

  private constructor(kind: string, identifier: string) {
    super(`${kind} "${identifier}" is already registered`);
    this.kind = kind;
    this.identifier = identifier;
  }

  static alreadyRegistered(ctx: {
    kind: string;
    identifier: string;
  }): DuplicateRegistrationError {
    return new DuplicateRegistrationError(ctx.kind, ctx.identifier);
  }
}

export class DuplicateAdminSlugError extends Error {
  static {
    DuplicateAdminSlugError.prototype.name = "DuplicateAdminSlugError";
  }

  readonly firstPostType: string;
  readonly secondPostType: string;
  readonly slug: string;

  private constructor(
    firstPostType: string,
    secondPostType: string,
    slug: string,
  ) {
    super(
      `Entry types "${firstPostType}" and "${secondPostType}" both resolve ` +
        `to the admin slug "${slug}". Set \`labels.plural\` on one of them ` +
        `to disambiguate.`,
    );
    this.firstPostType = firstPostType;
    this.secondPostType = secondPostType;
    this.slug = slug;
  }

  static slugCollision(ctx: {
    firstPostType: string;
    secondPostType: string;
    slug: string;
  }): DuplicateAdminSlugError {
    return new DuplicateAdminSlugError(
      ctx.firstPostType,
      ctx.secondPostType,
      ctx.slug,
    );
  }
}
