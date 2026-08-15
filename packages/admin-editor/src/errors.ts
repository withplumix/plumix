export class EditorError extends Error {
  static {
    EditorError.prototype.name = "EditorError";
  }

  private constructor(message: string) {
    super(message);
  }

  static missingProvider(): EditorError {
    return new EditorError(
      "useEditorStore must be used within <EditorProvider/>.",
    );
  }

  static missingStyleFieldsProvider(): EditorError {
    return new EditorError(
      "useStyleFields must be used within <StyleFieldsProvider/>.",
    );
  }

  static missingConfigProvider(): EditorError {
    return new EditorError(
      "useEditorConfig must be used within <EditorConfigProvider/>.",
    );
  }
}
