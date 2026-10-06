-- Custom SQL migration file, put your code below! --
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    title,
    body,
    content='search_documents',
    content_rowid='id',
    tokenize='porter unicode61 remove_diacritics 2'
  );
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS search_documents_ai AFTER INSERT ON search_documents
  BEGIN
    INSERT INTO search_index (rowid, title, body)
    VALUES (new.id, new.title, new.body);
  END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS search_documents_ad AFTER DELETE ON search_documents
  BEGIN
    INSERT INTO search_index (search_index, rowid, title, body)
    VALUES ('delete', old.id, old.title, old.body);
  END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS search_documents_au
   AFTER UPDATE OF title, body ON search_documents
  BEGIN
    INSERT INTO search_index (search_index, rowid, title, body)
    VALUES ('delete', old.id, old.title, old.body);
    INSERT INTO search_index (rowid, title, body)
    VALUES (new.id, new.title, new.body);
  END;
