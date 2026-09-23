-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 6.1 (AI Agency Assistant, read-only). One conversation thread per
-- chat session. last_response_id is OpenAI's Responses API response id —
-- storing it lets the next user turn chain via previous_response_id instead
-- of resending the whole transcript (cost control), and lets a reload
-- resume the same server-side conversation state.

create table if not exists freelance_hq_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references freelance_hq_profiles (id) on delete cascade,
  title text not null default '',
  last_response_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists freelance_hq_ai_conversations_user_id_idx on freelance_hq_ai_conversations (user_id, updated_at desc);

alter table freelance_hq_ai_conversations enable row level security;
