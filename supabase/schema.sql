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
  id          text primary key,              -- '<run id>:<visitor>'; republishing replaces the draft
  created_at  timestamptz not null default now(),
  data        jsonb not null
);
create index if not exists demo_store_created_at_idx on public.demo_store (created_at desc);
alter table public.demo_store enable row level security;
-- Each visitor sees only their own drafts (hashed cookie id); 'showcase' rows are the owner's and shown to everyone.
alter table public.demo_store add column if not exists visitor text;
create index if not exists demo_store_visitor_idx on public.demo_store (visitor, created_at desc);

-- Public bucket: result images are meant to be shared via /r/<id>.
insert into storage.buckets (id, name, public)
values ('runs', 'runs', true)
on conflict (id) do nothing;

-- Retention runs in the app: GET /api/purge (daily Vercel schedule in vercel.json, needs CRON_SECRET) deletes
-- visitors' live runs and their images after 30 days and their demo-store drafts after 7 days. It goes through
-- the Storage API because Supabase refuses SQL deletes on storage.objects.
