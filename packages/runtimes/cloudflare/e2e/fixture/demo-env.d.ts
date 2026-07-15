// Minimal Vite ambient types for the demo SQL loader (demo-sql.ts), which runs
// only in the Vite-built worker. Avoids depending on `vite/client` here.

declare module "*?raw" {
  const content: string;
  export default content;
}

interface ImportMeta {
  glob<T = unknown>(
    pattern: string,
    options: { query: string; import: string; eager: true },
  ): Record<string, T>;
}
