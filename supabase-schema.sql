-- Run this once in Supabase → SQL Editor → New query → Run.
-- Creates the table that stores everything users do.

create table if not exists public.conversations (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  mode        text,          -- "chat" or "analysis"
  question    text,          -- chat: the user's message / analysis: the idea
  answer      text,          -- chat: the reply / analysis: the raw result
  analysis    jsonb,         -- analysis only: the FULL structured result
                             -- (includes التحليل + الخريطة + الإنفوجرافيك + الفيديو)
  title       text,          -- analysis only: the idea title, for quick scanning
  session_id  text           -- groups one visitor's messages together
);

-- If you already created the table before, these add the new columns safely:
alter table public.conversations add column if not exists analysis jsonb;
alter table public.conversations add column if not exists title text;

-- Keep the table private: only your server (service key) can read/write it.
alter table public.conversations enable row level security;
