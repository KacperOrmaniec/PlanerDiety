-- Run this once in the Supabase dashboard: Project -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: every statement is guarded, so applying it again after an update is a no-op.
--
-- 1. public.plans    - one row per user with their whole plan/eaten/goals state
-- 2. public.progress - one row per body-measurement check-in (the "Postępy" tab)
-- 3. storage bucket  - private "progress-photos" for the progress photos


-- 1. The meal plan -------------------------------------------------------
-- One row per user (same shape as the old localStorage keys diet-plan-v1 / diet-eaten-v1 /
-- diet-target-v1), protected by Row Level Security so a user can only ever touch their own row.

create table if not exists public.plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan jsonb not null default '{}'::jsonb,
  eaten jsonb not null default '{}'::jsonb,
  goals jsonb not null default '{"global": 2400, "days": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Ad-hoc food logged straight into a day ("szybki wpis"): self-contained entries that count
-- towards the day's totals but never enter the recipe catalogue, which is a static build artifact.
-- Shape: { "<YYYY-MM-DD>": [ { id, name, kcal, p, f, c, cat } ] } - cat is optional.
alter table public.plans add column if not exists extras jsonb not null default '{}'::jsonb;

alter table public.plans enable row level security;

drop policy if exists "select own plan" on public.plans;
create policy "select own plan" on public.plans
  for select using (auth.uid() = user_id);

drop policy if exists "insert own plan" on public.plans;
create policy "insert own plan" on public.plans
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own plan" on public.plans;
create policy "update own plan" on public.plans
  for update using (auth.uid() = user_id);


-- 2. Progress check-ins --------------------------------------------------
-- One row per user per date. Every measurement is nullable on purpose: a check-in may carry only
-- a weight, only photos, or only a note - the app fills in the gaps in charts rather than
-- forcing a complete entry. `unique (user_id, date)` keeps it to one check-in per day, which is
-- what makes "add" and "edit that day" the same action.
-- Photo columns hold storage paths (see 3.), never image data.

create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,

  weight numeric(6,2),             -- kg
  waist numeric(6,2),              -- cm
  hips numeric(6,2),               -- cm
  thigh numeric(6,2),              -- cm
  biceps numeric(6,2),             -- cm
  body_fat_percent numeric(5,2),   -- %
  muscle_percent numeric(5,2),     -- %

  photo_front text,                -- storage path, e.g. <user_id>/<entry_id>/photo_front.jpg
  photo_side text,
  photo_back text,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, date)
);

create index if not exists progress_user_date_idx on public.progress (user_id, date desc);

alter table public.progress enable row level security;

drop policy if exists "select own progress" on public.progress;
create policy "select own progress" on public.progress
  for select using (auth.uid() = user_id);

drop policy if exists "insert own progress" on public.progress;
create policy "insert own progress" on public.progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own progress" on public.progress;
create policy "update own progress" on public.progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own progress" on public.progress;
create policy "delete own progress" on public.progress
  for delete using (auth.uid() = user_id);


-- 3. Progress photos -----------------------------------------------------
-- A private bucket: progress photos are about as personal as this app gets, so nothing is served
-- publicly and the client reads them through short-lived signed URLs. Files are laid out as
-- <user_id>/<entry_id>/<slot>.jpg (plus a _thumb.jpg for the history list), so the first path
-- segment is the owner and the policies below can compare it against auth.uid().

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

drop policy if exists "read own progress photos" on storage.objects;
create policy "read own progress photos" on storage.objects
  for select using (
    bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "write own progress photos" on storage.objects;
create policy "write own progress photos" on storage.objects
  for insert with check (
    bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "replace own progress photos" on storage.objects;
create policy "replace own progress photos" on storage.objects
  for update using (
    bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "delete own progress photos" on storage.objects;
create policy "delete own progress photos" on storage.objects
  for delete using (
    bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
