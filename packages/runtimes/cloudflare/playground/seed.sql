-- Seed for the demo playground DO. The synthetic demo admin is user id 1 (the
-- authenticator returns that identity), so entries created in the editor
-- satisfy the entries.author_id foreign key.

INSERT OR IGNORE INTO users (id, email, name, role, meta)
  VALUES (1, 'editor@plumix.example', 'Demo Editor', 'admin', '{}');

INSERT INTO settings ("group", "key", "value")
  VALUES ('site', 'title', '"Plumix Demo"');

INSERT INTO entries (type, title, slug, content, status, author_id, published_at)
  VALUES ('post', 'Hello from the showcase', 'hello-from-the-showcase', NULL,
          'published', 1, unixepoch());
