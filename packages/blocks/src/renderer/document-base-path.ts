/**
 * The subdirectory prefix this deployment is mounted under, empty at the
 * domain root. Read from the marker the islands bootstrap `<script>` injects,
 * because the callers cannot use `useBasePath`: a hydrated island has no
 * `PlumixProvider` context, and a public page carries no `<base href>`.
 * Without it a subdirectory deployment would post to the domain root and 404.
 */
export function documentBasePath(): string {
  if (typeof document === "undefined") return "";
  return (
    document.querySelector<HTMLScriptElement>("script[data-plumix-base-path]")
      ?.dataset.plumixBasePath ?? ""
  );
}
