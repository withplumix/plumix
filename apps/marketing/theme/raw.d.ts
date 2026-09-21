// Vite's `?raw` suffix: the snippets on the page are imported as text from
// `snippets/`, where they are typechecked as real code.
declare module "*?raw" {
  const source: string;
  export default source;
}
