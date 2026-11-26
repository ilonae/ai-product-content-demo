-- AI product-content demo: run rows + image bucket.
-- Paste into the Supabase SQL editor. Safe to re-run.

create table if not exists public.runs (
  id            text primary key,
  created_at    timestamptz not null default now(),
  source        text not null check (source in ('live', 'gallery')),
  est_cost_usd  numeric(8, 3) not null default 0,
  data          jsonb not null
);
create index if not exists runs_created_at_idx on public.runs (created_at desc);

-- Service role only: the app reads/writes server-side, the browser never talks to this table.
alter table public.runs enable row level security;

-- Built-in demo store: drafts that visitors publish from a result page (no real shop involved).
create table if not exists public.demo_store (
  id          text primary key,              -- the run id; republishing replaces the draft
  created_at  timestamptz not null default now(),
  data        jsonb not null
);
create index if not exists demo_store_created_at_idx on public.demo_store (created_at desc);
alter table public.demo_store enable row level security;

-- Public bucket: result images are meant to be shared via /r/<id>.
insert into storage.buckets (id, name, public)
values ('runs', 'runs', true)
on conflict (id) do nothing;

-- Retention: before sharing the demo publicly, delete live runs after 30 days.
-- With the pg_cron extension enabled (Database → Extensions):
-- select cron.schedule('purge-live-runs', '15 3 * * *', $$
--   delete from storage.objects o using public.runs r
--    where o.bucket_id = 'runs' and split_part(o.name, '/', 1) = r.id
--      and r.source = 'live' and r.created_at < now() - interval '30 days';
--   delete from public.runs where source = 'live' and created_at < now() - interval '30 days';
-- $$);
