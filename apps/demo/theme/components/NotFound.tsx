import type { ReactNode } from "react";

export function NotFound(): ReactNode {
  return (
    <section className="py-16 text-center" data-testid="not-found">
      <h1 className="font-serif text-3xl">Page not found</h1>
      <p className="text-muted mt-4">
        The page you're looking for doesn't exist or has moved.
      </p>
      <a href="/" className="text-accent mt-6 inline-block hover:underline">
        ← Back home
      </a>
    </section>
  );
}
