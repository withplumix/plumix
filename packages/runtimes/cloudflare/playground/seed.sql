-- Seed for the demo playground DO. The synthetic demo admin is user id 1 (the
-- authenticator returns that identity), so entries created in the editor
-- satisfy the entries.author_id foreign key.

INSERT OR IGNORE INTO users (id, email, name, role, meta)
  VALUES (1, 'editor@plumix.example', 'Demo Editor', 'admin', '{}');

INSERT INTO settings ("group", "key", "value")
  VALUES ('site', 'title', '"Plumix Demo"');

-- Seed the showcase post with real block content so the editor canvas has
-- tagged, selectable blocks (the demo e2e opens this entry to prove the visual
-- editor boots in the demo runtime).
INSERT INTO entries (type, title, slug, content, status, author_id, published_at)
  VALUES ('post', 'Hello from the showcase', 'hello-from-the-showcase',
          '{"version":"plumix.v2","blocks":[{"id":"seed-heading","name":"core/rich-text","attrs":{"body":"<h2>Hello from the showcase</h2>"}},{"id":"seed-copy","name":"core/rich-text","attrs":{"body":"<p>Edit me in the demo.</p>"}}]}',
          'published', 1, unixepoch());
