type BlockRegistrationErrorCode =
  | "invalid_name_pattern"
  | "duplicate_name"
  | "core_block_collision"
  | "theme_override_unknown_name"
  | "schema_name_mismatch"
  | "unknown_attribute_type";

interface BlockRegistrationErrorFields {
  blockName?: string;
  pattern?: string;
  layer?: string;
  registeredBy?: string;
  themeId?: string;
  schemaName?: string;
  attributeName?: string;
  attributeType?: string;
}

const NAME_PATTERN = "^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$";

export class BlockRegistrationError extends Error {
  static {
    BlockRegistrationError.prototype.name = "BlockRegistrationError";
  }

  readonly code: BlockRegistrationErrorCode;
  readonly blockName: string | undefined;
  readonly pattern: string | undefined;
  readonly layer: string | undefined;
  readonly registeredBy: string | undefined;
  readonly themeId: string | undefined;
  readonly schemaName: string | undefined;
  readonly attributeName: string | undefined;
  readonly attributeType: string | undefined;

  private constructor(
    code: BlockRegistrationErrorCode,
    message: string,
    fields: BlockRegistrationErrorFields,
  ) {
    super(message);
    this.code = code;
    this.blockName = fields.blockName;
    this.pattern = fields.pattern;
    this.layer = fields.layer;
    this.registeredBy = fields.registeredBy;
    this.themeId = fields.themeId;
    this.schemaName = fields.schemaName;
    this.attributeName = fields.attributeName;
    this.attributeType = fields.attributeType;
  }

  static invalidNamePattern(ctx: {
    name: string;
    pattern?: string;
  }): BlockRegistrationError {
    const pattern = ctx.pattern ?? NAME_PATTERN;
    return new BlockRegistrationError(
      "invalid_name_pattern",
      `Block name "${ctx.name}" does not match the required namespace/name ` +
        `pattern ${pattern}. Names must be lowercase, namespaced ` +
        `(e.g. "core/paragraph", "media/image", "acme/testimonial").`,
      { blockName: ctx.name, pattern },
    );
  }

  static duplicateName(ctx: {
    name: string;
    layer: "core" | "plugin" | "theme";
  }): BlockRegistrationError {
    return new BlockRegistrationError(
      "duplicate_name",
      `Block "${ctx.name}" is registered twice within the ${ctx.layer} ` +
        `layer. Each block name must be unique within its layer; ` +
        `theme > plugin > core precedence handles cross-layer overrides.`,
      { blockName: ctx.name, layer: ctx.layer },
    );
  }

  static coreBlockCollision(ctx: {
    name: string;
    registeredBy: string;
  }): BlockRegistrationError {
    return new BlockRegistrationError(
      "core_block_collision",
      `Plugin "${ctx.registeredBy}" tried to register block "${ctx.name}" ` +
        `using the "core/" namespace, which is reserved for blocks shipped ` +
        `with @plumix/blocks. Use a plugin-scoped namespace instead.`,
      { blockName: ctx.name, registeredBy: ctx.registeredBy },
    );
  }

  static themeOverrideUnknownName(ctx: {
    name: string;
    themeId: string;
  }): BlockRegistrationError {
    return new BlockRegistrationError(
      "theme_override_unknown_name",
      `Theme "${ctx.themeId}" tried to override block "${ctx.name}", but no ` +
        `core or plugin block by that name is registered. Themes can only ` +
        `override existing blocks or register entirely new theme-namespaced ` +
        `blocks via ctx.registerBlock.`,
      { blockName: ctx.name, themeId: ctx.themeId },
    );
  }

  static schemaNameMismatch(ctx: {
    specName: string;
    schemaName: string;
  }): BlockRegistrationError {
    return new BlockRegistrationError(
      "schema_name_mismatch",
      `Block "${ctx.specName}" has a Tiptap schema with name "${ctx.schemaName}". ` +
        `The spec name and the Tiptap node name must match — otherwise ` +
        `the walker cannot resolve nodes through the registry.`,
      { blockName: ctx.specName, schemaName: ctx.schemaName },
    );
  }

  static unknownAttributeType(ctx: {
    name: string;
    attributeName: string;
    attributeType: string;
  }): BlockRegistrationError {
    return new BlockRegistrationError(
      "unknown_attribute_type",
      `Block "${ctx.name}" declares attribute "${ctx.attributeName}" with ` +
        `type "${ctx.attributeType}", which is not registered in the ` +
        `field-type registry. Register the field type via ` +
        `ctx.registerFieldType before referencing it from a block.`,
      {
        blockName: ctx.name,
        attributeName: ctx.attributeName,
        attributeType: ctx.attributeType,
      },
    );
  }
}
