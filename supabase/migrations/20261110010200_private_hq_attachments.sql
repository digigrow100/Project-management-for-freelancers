-- Deploy the authenticated attachment route before making existing URLs private.
update storage.buckets
set public = false
where id in ('task-files', 'task-images', 'project-attachments', 'backlink-files')
  and public;
