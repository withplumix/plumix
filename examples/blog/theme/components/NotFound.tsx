import * as React from "react";
import type { ReactNode } from "react";

export function NotFound(): ReactNode {
  return (
    <section className="py-16 text-center" data-testid="not-found">
      <h1 className="font-serif text-3xl">Page not found</h1>
      <p className="mt-4 text-muted">
        The page you're looking for doesn't exist or has moved.
      </p>
      <a href="/" className="mt-6 inline-block text-accent hover:underline">
        ← Back home
      </a>
    </section>
  );
}
