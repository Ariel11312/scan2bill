-- Run in Supabase SQL editor.
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  rate_per_kwh numeric(10,4) not null default 0,
  currency text not null default 'PHP',
  updated_at timestamptz default now()
);

create table if not exists readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  reading numeric(12,1) not null,
  previous_reading numeric(12,1),
  consumption_kwh numeric(12,1),
  rate_per_kwh numeric(10,4) not null,
  estimated_bill numeric(12,2),
  ocr_raw text,
  was_manually_edited boolean not null default false,
  scanned_at timestamptz not null default now()
);

create index if not exists readings_user_time on readings (user_id, scanned_at desc);

alter table profiles enable row level security;
alter table readings enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own readings" on readings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
