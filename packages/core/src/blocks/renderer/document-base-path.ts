/**
 * For code that can't use `useBasePath`: a hydrated island has no
 * `PlumixProvider`, and a public page carries no `<base href>`.
 */
export function documentBasePath(): string {
  if (typeof document === "undefined") return "";
  return (
    document.querySelector<HTMLScriptElement>("script[data-plumix-base-path]")
      ?.dataset.plumixBasePath ?? ""
  );
}
