-- Run this once in Supabase → SQL Editor → New query → Run.
-- It creates the table where every question + answer is stored.

create table if not exists public.conversations (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  mode        text,          -- "chat" or "analysis"
  question    text,          -- what the user asked
  answer      text,          -- what the AI replied
  session_id  text           -- groups one visitor's messages together
);

-- Keep the table private: only your server (service key) can read/write it.
alter table public.conversations enable row level security;
-- No public policies are added, so the anon/public key cannot touch it.
