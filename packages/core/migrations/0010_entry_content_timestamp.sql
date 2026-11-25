CREATE TRIGGER entries_content_timestamp AFTER UPDATE ON entries
  WHEN new.updated_at IS old.updated_at
    AND (old.id IS NOT new.id
      OR old.type IS NOT new.type
      OR old.parent_id IS NOT new.parent_id
      OR old.title IS NOT new.title
      OR old.slug IS NOT new.slug
      OR old.content IS NOT new.content
      OR old.excerpt IS NOT new.excerpt
      OR old.status IS NOT new.status
      OR old.author_id IS NOT new.author_id
      OR old.sort_order IS NOT new.sort_order
      OR old.meta IS NOT new.meta
      OR old.published_at IS NOT new.published_at
      OR old.created_at IS NOT new.created_at)
  BEGIN
    UPDATE entries SET updated_at = max(unixepoch(), old.updated_at + 1)
      WHERE id = new.id;
  END;
