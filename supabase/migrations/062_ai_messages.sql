-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 6.1. Chat message history per conversation. tool_calls records which
-- function tools ran and their (small, already-permission-checked) results —
-- this is the assistant's audit trail; no separate activity-log table is
-- introduced, matching the compute-from-source approach used everywhere
-- else in this app.

create table if not exists freelance_hq_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references freelance_hq_ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  tool_calls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists freelance_hq_ai_messages_conversation_id_idx on freelance_hq_ai_messages (conversation_id, created_at);

alter table freelance_hq_ai_messages enable row level security;
