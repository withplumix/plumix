import { describe, expect, test } from "vitest";

import { PluginContextError, PluginDefinitionError } from "./errors.js";

describe("PluginContextError.duplicateRoute", () => {
  test("class identity, code, and exposed fields", () => {
    const err = PluginContextError.duplicateRoute({
      pluginId: "blog",
      method: "GET",
      path: "/api/posts",
    });
    expect(err).toBeInstanceOf(PluginContextError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PluginContextError");
    expect(err.code).toBe("duplicate_route");
    expect(err.pluginId).toBe("blog");
    expect(err.kind).toBe("GET");
    expect(err.path).toBe("/api/posts");
  });

  test("message names plugin, method, and path", () => {
    const err = PluginContextError.duplicateRoute({
      pluginId: "blog",
      method: "POST",
      path: "/api/posts",
    });
    expect(err.message).toContain(
      'Plugin "blog" already registered a route for POST /api/posts',
    );
  });
});

describe("PluginContextError — extend-context factories", () => {
  test("extendContextInvalidKey", () => {
    const err = PluginContextError.extendContextInvalidKey({
      pluginId: "blog",
      kind: "Plugin",
    });
    expect(err.code).toBe("extend_context_invalid_key");
    expect(err.pluginId).toBe("blog");
    expect(err.kind).toBe("Plugin");
    expect(err.message).toContain("extendPluginContext with an invalid key");
  });

  test("extendContextReservedKey", () => {
    const err = PluginContextError.extendContextReservedKey({
      pluginId: "blog",
      kind: "Theme",
      key: "__proto__",
    });
    expect(err.code).toBe("extend_context_reserved_key");
    expect(err.key).toBe("__proto__");
    expect(err.message).toContain("extendThemeContext with the reserved name");
    expect(err.message).toContain('"__proto__"');
  });

  test("extendAppContextBuiltinCollision", () => {
    const err = PluginContextError.extendAppContextBuiltinCollision({
      pluginId: "blog",
      key: "db",
    });
    expect(err.code).toBe("extend_app_context_builtin_collision");
    expect(err.key).toBe("db");
    expect(err.message).toContain('extendAppContext with "db"');
    expect(err.message).toContain("built-in AppContext member");
  });

  test("extendContextDuplicate", () => {
    const err = PluginContextError.extendContextDuplicate({
      pluginId: "blog",
      kind: "Plugin",
      key: "logger",
      existingOwner: "core-logger",
    });
    expect(err.code).toBe("extend_context_duplicate");
    expect(err.existingOwner).toBe("core-logger");
    expect(err.message).toContain('extended the plugin context with "logger"');
    expect(err.message).toContain('"core-logger" already registered it');
  });
});

describe("PluginContextError — capability + settings + RPC factories", () => {
  test("derivedCapabilityMinRoleMismatch", () => {
    const err = PluginContextError.derivedCapabilityMinRoleMismatch({
      pluginId: "blog",
      capName: "edit_posts",
      minRole: "editor",
      existingMinRole: "author",
      existingOwner: "core",
    });
    expect(err.code).toBe("derived_capability_min_role_mismatch");
    expect(err.capName).toBe("edit_posts");
    expect(err.minRole).toBe("editor");
    expect(err.existingMinRole).toBe("author");
    expect(err.message).toContain('capability "edit_posts"');
    expect(err.message).toContain('minRole "editor"');
    expect(err.message).toContain('minRole "author"');
  });

  test("settingsPageDuplicateGroup", () => {
    const err = PluginContextError.settingsPageDuplicateGroup({
      name: "general",
    });
    expect(err.code).toBe("settings_page_duplicate_group");
    expect(err.identifierName).toBe("general");
    expect(err.message).toContain('Settings page "general"');
    expect(err.message).toContain("lists a group more than once");
  });

  test("pluginIdCollidesWithCoreRpcNamespace", () => {
    const err = PluginContextError.pluginIdCollidesWithCoreRpcNamespace({
      pluginId: "auth",
      coreNamespaces: ["auth", "posts"],
    });
    expect(err.code).toBe("plugin_id_collides_with_core_rpc_namespace");
    expect(err.coreNamespaces).toEqual(["auth", "posts"]);
    expect(err.message).toContain(
      'Plugin id "auth" collides with core RPC namespace',
    );
    expect(err.message).toContain("auth, posts");
  });

  test("extensionShadowsBuiltin", () => {
    const err = PluginContextError.extensionShadowsBuiltin({
      key: "registerEntryType",
    });
    expect(err.code).toBe("extension_shadows_builtin");
    expect(err.key).toBe("registerEntryType");
    expect(err.message).toContain(
      'Plugin context extension key "registerEntryType"',
    );
  });
});

describe("PluginContextError — registration-validation factories", () => {
  test("invalidComponentRef", () => {
    const err = PluginContextError.invalidComponentRef({
      pluginId: "media",
      descriptor: 'admin page "/media"',
    });
    expect(err.code).toBe("invalid_component_ref");
    expect(err.descriptor).toBe('admin page "/media"');
    expect(err.message).toContain(
      'Plugin "media" registered admin page "/media"',
    );
    expect(err.message).toContain("invalid component ref");
  });

  test("invalidFieldTypeName", () => {
    const err = PluginContextError.invalidFieldTypeName({
      pluginId: "blog",
      type: "Bad Type!",
      pattern: "^[a-z][a-z0-9_-]*$",
      maxLength: 64,
    });
    expect(err.code).toBe("invalid_field_type_name");
    expect(err.type).toBe("Bad Type!");
    expect(err.message).toContain('field type with invalid name "Bad Type!"');
    expect(err.message).toContain("^[a-z][a-z0-9_-]*$");
    expect(err.message).toContain("64");
  });

  test("invalidLookupAdapterKind", () => {
    const err = PluginContextError.invalidLookupAdapterKind({
      pluginId: "media",
      kind: "Bad",
      pattern: "^[a-z][a-z0-9_-]*$",
      maxLength: 64,
    });
    expect(err.code).toBe("invalid_lookup_adapter_kind");
    expect(err.kind).toBe("Bad");
    expect(err.message).toContain('lookup adapter with invalid kind "Bad"');
  });

  test("invalidScheduledTaskId", () => {
    const err = PluginContextError.invalidScheduledTaskId({
      pluginId: "blog",
      id: "Bad Id!",
    });
    expect(err.code).toBe("invalid_scheduled_task_id");
    expect(err.id).toBe("Bad Id!");
    expect(err.message).toContain('scheduled task with invalid id "Bad Id!"');
  });

  test("scheduledTaskHandlerMissing", () => {
    const err = PluginContextError.scheduledTaskHandlerMissing({
      pluginId: "blog",
      id: "daily-purge",
    });
    expect(err.code).toBe("scheduled_task_handler_missing");
    expect(err.id).toBe("daily-purge");
    expect(err.message).toContain('scheduled task "daily-purge" without');
    expect(err.message).toContain("handler function");
  });
});

describe("PluginContextError — login link factories", () => {
  test("invalidLoginLinkKey", () => {
    const err = PluginContextError.invalidLoginLinkKey({
      pluginId: "saml",
      key: "Bad Key!",
    });
    expect(err.code).toBe("invalid_login_link_key");
    expect(err.key).toBe("Bad Key!");
    expect(err.message).toContain('login link with invalid key "Bad Key!"');
  });

  test("loginLinkEmptyLabel", () => {
    const err = PluginContextError.loginLinkEmptyLabel({
      pluginId: "saml",
      key: "sso",
    });
    expect(err.code).toBe("login_link_empty_label");
    expect(err.key).toBe("sso");
    expect(err.message).toContain('login link "sso" with an empty label');
  });

  test("loginLinkLabelHasCrLf", () => {
    const err = PluginContextError.loginLinkLabelHasCrLf({
      pluginId: "saml",
      key: "sso",
    });
    expect(err.code).toBe("login_link_label_has_crlf");
    expect(err.message).toContain("label containing CR/LF");
  });

  test("invalidLoginLinkHref", () => {
    const err = PluginContextError.invalidLoginLinkHref({
      pluginId: "saml",
      key: "sso",
      href: "javascript:alert(1)",
    });
    expect(err.code).toBe("invalid_login_link_href");
    expect(err.href).toBe("javascript:alert(1)");
    expect(err.message).toContain('href "javascript:alert(1)"');
    expect(err.message).toContain('must start with "/"');
    expect(err.message).toContain('"https://"');
  });
});

describe("PluginContextError — nav group factories", () => {
  test("invalidNavGroupIdLength", () => {
    const err = PluginContextError.invalidNavGroupIdLength({
      pluginId: "blog",
      id: "",
      maxLength: 64,
    });
    expect(err.code).toBe("invalid_nav_group_id_length");
    expect(err.maxLength).toBe(64);
    expect(err.message).toContain("admin nav group with invalid id");
    expect(err.message).toContain("length must be 1..64");
  });

  test("invalidNavGroupIdShape", () => {
    const err = PluginContextError.invalidNavGroupIdShape({
      pluginId: "blog",
      id: "Bad Id!",
      pattern: "^[a-z][a-z0-9-]*$",
    });
    expect(err.code).toBe("invalid_nav_group_id_shape");
    expect(err.pattern).toBe("^[a-z][a-z0-9-]*$");
    expect(err.message).toContain('admin nav group with invalid id "Bad Id!"');
    expect(err.message).toContain("^[a-z][a-z0-9-]*$");
  });
});

describe("PluginContextError — path validation factories", () => {
  test("pathMustStartWithSlash", () => {
    const err = PluginContextError.pathMustStartWithSlash({
      pluginId: "blog",
      kind: "admin page",
      path: "no-slash",
    });
    expect(err.code).toBe("path_must_start_with_slash");
    expect(err.kind).toBe("admin page");
    expect(err.message).toContain(
      'admin page path "no-slash" must start with "/"',
    );
  });

  test("pathContainsTraversal", () => {
    const err = PluginContextError.pathContainsTraversal({
      pluginId: "blog",
      kind: "route",
      path: "/foo//bar",
    });
    expect(err.code).toBe("path_contains_traversal");
    expect(err.message).toContain(
      'route path "/foo//bar" contains "//" or ".."',
    );
  });

  test("pathContainsQueryOrFragment", () => {
    const err = PluginContextError.pathContainsQueryOrFragment({
      pluginId: "blog",
      kind: "admin page",
      path: "/foo?bar",
    });
    expect(err.code).toBe("path_contains_query_or_fragment");
    expect(err.message).toContain('admin page path "/foo?bar"');
    expect(err.message).toContain(
      "must not include a query string or fragment",
    );
  });

  test("adminPagePathContainsWildcard", () => {
    const err = PluginContextError.adminPagePathContainsWildcard({
      pluginId: "blog",
      path: "/foo/*",
    });
    expect(err.code).toBe("admin_page_path_contains_wildcard");
    expect(err.message).toContain(
      'admin page path "/foo/*" must not contain "*"',
    );
  });

  test("routePathWildcardNotAtEnd", () => {
    const err = PluginContextError.routePathWildcardNotAtEnd({
      pluginId: "blog",
      path: "/foo/*/bar",
    });
    expect(err.code).toBe("route_path_wildcard_not_at_end");
    expect(err.message).toContain(
      'route path "/foo/*/bar" may only contain "*" as a trailing wildcard',
    );
  });

  test("routePathWildcardNotAfterSlash", () => {
    const err = PluginContextError.routePathWildcardNotAfterSlash({
      pluginId: "blog",
      path: "/foo*",
    });
    expect(err.code).toBe("route_path_wildcard_not_after_slash");
    expect(err.message).toContain(
      'route path "/foo*" must place the trailing wildcard after a "/"',
    );
  });
});

describe("PluginContextError — identifier + meta-box factories", () => {
  test("identifierTooLong", () => {
    const err = PluginContextError.identifierTooLong({
      kind: "settings group",
      name: "x".repeat(65),
      maxLength: 64,
    });
    expect(err.code).toBe("identifier_too_long");
    expect(err.kind).toBe("settings group");
    expect(err.maxLength).toBe(64);
    expect(err.message).toContain("Invalid settings group name");
    expect(err.message).toContain("capped at 64 characters");
  });

  test("identifierShapeInvalid", () => {
    const err = PluginContextError.identifierShapeInvalid({
      kind: "settings group",
      name: "Bad Name!",
      pattern: "^[a-z][a-z0-9_]*$",
    });
    expect(err.code).toBe("identifier_shape_invalid");
    expect(err.message).toContain('Invalid settings group name "Bad Name!"');
    expect(err.message).toContain("^[a-z][a-z0-9_]*$");
  });

  test("metaBoxTooManyFields", () => {
    const err = PluginContextError.metaBoxTooManyFields({
      kind: "entry meta box",
      id: "seo",
      count: 250,
      maxFields: 200,
    });
    expect(err.code).toBe("meta_box_too_many_fields");
    expect(err.count).toBe(250);
    expect(err.maxFields).toBe(200);
    expect(err.message).toContain('entry meta box "seo" declares 250 fields');
    expect(err.message).toContain("caps a single box at 200");
  });

  test("metaBoxFieldInvalidKey", () => {
    const err = PluginContextError.metaBoxFieldInvalidKey({
      kind: "entry meta box",
      id: "seo",
      fieldKey: "bad key!",
      pattern: "^[a-zA-Z0-9_:-]+$",
    });
    expect(err.code).toBe("meta_box_field_invalid_key");
    expect(err.fieldKey).toBe("bad key!");
    expect(err.message).toContain(
      'entry meta box "seo" declares field with invalid key "bad key!"',
    );
  });

  test("metaBoxFieldDuplicateKey", () => {
    const err = PluginContextError.metaBoxFieldDuplicateKey({
      kind: "entry meta box",
      id: "seo",
      fieldKey: "title",
    });
    expect(err.code).toBe("meta_box_field_duplicate_key");
    expect(err.fieldKey).toBe("title");
    expect(err.message).toContain(
      'entry meta box "seo" declares field "title" more than once',
    );
  });
});

describe("PluginDefinitionError", () => {
  test("invalidPluginIdLength", () => {
    const err = PluginDefinitionError.invalidPluginIdLength({
      pluginId: "",
      pluginIdMaxLength: 64,
    });
    expect(err).toBeInstanceOf(PluginDefinitionError);
    expect(err.name).toBe("PluginDefinitionError");
    expect(err.code).toBe("invalid_plugin_id_length");
    expect(err.pluginIdMaxLength).toBe(64);
    expect(err.message).toContain('Plugin id "" must be between 1 and 64');
  });

  test("invalidPluginIdShape", () => {
    const err = PluginDefinitionError.invalidPluginIdShape({
      pluginId: "Bad",
      pattern: "^[a-z][a-z0-9_-]*$",
    });
    expect(err.code).toBe("invalid_plugin_id_shape");
    expect(err.message).toContain('Plugin id "Bad" must match');
    expect(err.message).toContain("^[a-z][a-z0-9_-]*$");
  });

  test("definePluginLegacyThirdArg", () => {
    const err = PluginDefinitionError.definePluginLegacyThirdArg({
      pluginId: "blog",
    });
    expect(err.code).toBe("define_plugin_legacy_third_arg");
    expect(err.pluginId).toBe("blog");
    expect(err.message).toContain('definePlugin("blog", input)');
    expect(err.message).toContain("legacy third argument");
  });

  test("duplicatePluginIdInConfig", () => {
    const err = PluginDefinitionError.duplicatePluginIdInConfig({
      pluginId: "blog",
    });
    expect(err.code).toBe("duplicate_plugin_id_in_config");
    expect(err.message).toContain(
      'Plugin id "blog" appears more than once in config.plugins',
    );
  });

  test("metaFieldClashAcrossBoxes", () => {
    const err = PluginDefinitionError.metaFieldClashAcrossBoxes({
      kind: "entry",
      fieldKey: "title",
      firstBoxId: "seo",
      secondBoxId: "social",
      scope: "post",
    });
    expect(err.code).toBe("meta_field_clash_across_boxes");
    expect(err.firstBoxId).toBe("seo");
    expect(err.secondBoxId).toBe("social");
    expect(err.message).toContain('Meta field "title"');
    expect(err.message).toContain('"seo" and "social"');
    expect(err.message).toContain('"post"');
  });

  test("metaBoxReferencesUnknownScope", () => {
    const err = PluginDefinitionError.metaBoxReferencesUnknownScope({
      boxKind: "entry meta box",
      boxId: "seo",
      scopeKind: "entry type",
      scope: "page",
    });
    expect(err.code).toBe("meta_box_references_unknown_scope");
    expect(err.message).toContain(
      'entry meta box "seo" references entry type "page"',
    );
    expect(err.message).toContain("hasn't been registered");
  });

  test("settingsPageReferencesUnknownGroup", () => {
    const err = PluginDefinitionError.settingsPageReferencesUnknownGroup({
      pageName: "general",
      groupName: "missing",
    });
    expect(err.code).toBe("settings_page_references_unknown_group");
    expect(err.message).toContain(
      'Settings page "general" references group "missing"',
    );
    expect(err.message).toContain("ctx.registerSettingsGroup");
  });

  test("adminSlugDerivationFailed", () => {
    const err = PluginDefinitionError.adminSlugDerivationFailed({
      entryTypeName: "post",
      from: "its name",
    });
    expect(err.code).toBe("admin_slug_derivation_failed");
    expect(err.entryTypeName).toBe("post");
    expect(err.from).toBe("its name");
    expect(err.message).toContain(
      'Cannot derive an admin slug for post type "post" from its name',
    );
  });

  test("adminManifestPlaceholderMissing", () => {
    const err = PluginDefinitionError.adminManifestPlaceholderMissing({
      scriptId: "plumix-manifest",
    });
    expect(err.code).toBe("admin_manifest_placeholder_missing");
    expect(err.message).toContain('<script id="plumix-manifest">');
  });
});
