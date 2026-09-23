-- Incremental migration. Safe to run once in the SQL Editor.
--
-- Phase 6.2/6.3. The confirmation queue for AI-proposed writes (task
-- batches, invoice drafts, project drafts, SEO report drafts). The AI layer
-- never writes application data itself — it stages a proposal here, the
-- chat UI renders it as a preview card, and only a human clicking Confirm
-- triggers the real, existing Server Action (see app/api/ai/confirm).

create table if not exists freelance_hq_ai_pending_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references freelance_hq_ai_conversations (id) on delete cascade,
  created_by uuid not null references freelance_hq_profiles (id) on delete cascade,
  action_type text not null check (action_type in ('create_tasks', 'create_invoice', 'create_project', 'create_seo_report')),
  payload jsonb not null,
  summary text not null default '',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists freelance_hq_ai_pending_actions_conversation_id_idx on freelance_hq_ai_pending_actions (conversation_id);

alter table freelance_hq_ai_pending_actions enable row level security;
