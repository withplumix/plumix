export class BlockVariationError extends Error {
  static {
    BlockVariationError.prototype.name = "BlockVariationError";
  }

  private constructor(message: string) {
    super(message);
  }

  static unknownBlock(
    parentBlock: string,
    variationSlug: string,
    path: string,
    unknownName: string,
  ): BlockVariationError {
    return new BlockVariationError(
      `Variation "${variationSlug}" of "${parentBlock}" at ${path} references unknown block "${unknownName}".`,
    );
  }

  static undeclaredAttr(
    parentBlock: string,
    variationSlug: string,
    path: string,
    blockName: string,
    attrKey: string,
  ): BlockVariationError {
    return new BlockVariationError(
      `Variation "${variationSlug}" of "${parentBlock}" at ${path} uses undeclared attr "${attrKey}" on block "${blockName}".`,
    );
  }

  static missingContentSlot(
    parentBlock: string,
    variationSlug: string,
  ): BlockVariationError {
    return new BlockVariationError(
      `Variation "${variationSlug}" of "${parentBlock}" declares innerBlocks but the parent block has no "content" slot input.`,
    );
  }

  static invalidScope(
    parentBlock: string,
    variationSlug: string,
    value: string,
  ): BlockVariationError {
    return new BlockVariationError(
      `Variation "${variationSlug}" of "${parentBlock}" declares scope value "${value}" outside the allowed union ("inserter" | "block" | "transform").`,
    );
  }

  static transformScopeMissingAttrs(
    parentBlock: string,
    variationSlug: string,
  ): BlockVariationError {
    return new BlockVariationError(
      `Variation "${variationSlug}" of "${parentBlock}" is scoped "transform" but declares no attrs to apply — the action-bar entry would be a no-op.`,
    );
  }
}
