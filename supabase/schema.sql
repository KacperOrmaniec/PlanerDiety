-- Run this once in the Supabase dashboard: Project -> SQL Editor -> New query -> paste -> Run.
-- Creates one row per user holding their whole plan/eaten/goals state (same shape as the old
-- localStorage keys diet-plan-v1 / diet-eaten-v1 / diet-target-v1), protected by Row Level
-- Security so a user can only ever read or write their own row.

create table public.plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan jsonb not null default '{}'::jsonb,
  eaten jsonb not null default '{}'::jsonb,
  goals jsonb not null default '{"global": 2400, "days": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;

create policy "select own plan" on public.plans
  for select using (auth.uid() = user_id);

create policy "insert own plan" on public.plans
  for insert with check (auth.uid() = user_id);

create policy "update own plan" on public.plans
  for update using (auth.uid() = user_id);
