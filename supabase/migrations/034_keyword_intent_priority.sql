-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Adds search intent and priority to keywords, so the Keywords module can
-- surface why a keyword matters and how urgently, not just its ranking.
-- 'local' is a distinct intent (not folded into 'commercial') since this
-- agency's work is predominantly local-service SEO.

create type freelance_hq_search_intent as enum
  ('informational', 'navigational', 'commercial', 'transactional', 'local');

alter table freelance_hq_keywords
  add column if not exists search_intent freelance_hq_search_intent,
  add column if not exists priority text not null default 'medium' check (priority in ('low', 'medium', 'high'));
