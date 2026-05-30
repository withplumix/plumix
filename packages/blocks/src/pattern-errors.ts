export class PatternRegistryError extends Error {
  static {
    PatternRegistryError.prototype.name = "PatternRegistryError";
  }

  private constructor(message: string) {
    super(message);
  }

  static duplicateSlug(slug: string): PatternRegistryError {
    return new PatternRegistryError(`Duplicate pattern slug: ${slug}`);
  }

  static invalidBody(
    patternName: string,
    path: string,
    detail: string,
  ): PatternRegistryError {
    return new PatternRegistryError(
      `Pattern "${patternName}" is invalid at ${path}: ${detail}`,
    );
  }

  static undeclaredAttr(
    patternName: string,
    path: string,
    blockName: string,
    attrKey: string,
  ): PatternRegistryError {
    return new PatternRegistryError(
      `Pattern "${patternName}" at ${path} uses undeclared attr "${attrKey}" on block "${blockName}".`,
    );
  }
}
