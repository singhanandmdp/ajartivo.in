create extension if not exists pgcrypto;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text,
  last_name text,
  address text,
  mobile_number text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  is_banned boolean not null default false,
  is_premium boolean not null default false,
  current_plan_id text,
  premium_expiry timestamptz,
  free_download_count integer not null default 0,
  weekly_premium_download_count integer not null default 0,
  weekly_reset_date timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists is_banned boolean not null default false;
alter table public.profiles add column if not exists current_plan_id text;
alter table public.profiles add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.profiles add column if not exists updated_at timestamptz not null default timezone('utc', now());

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  image_url text not null,
  price numeric(10,2) not null default 0,
  is_free boolean not null default true,
  download_link text not null,
  tags text[] not null default '{}'::text[],
  category text default 'DESIGN',
  downloads integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.designs add column if not exists image_url text;
alter table public.designs add column if not exists tags text[] not null default '{}'::text[];
alter table public.designs add column if not exists updated_at timestamptz not null default timezone('utc', now());

create table if not exists public.plans_master (
  plan_id text primary key,
  name text not null,
  price numeric(10,2) not null default 0,
  duration_days integer not null,
  monthly_download_limit integer not null default 0,
  daily_ai_limit integer not null default 0,
  source_access text not null default 'none',
  library_access_percent integer not null default 0 check (library_access_percent >= 0 and library_access_percent <= 100),
  tools_access jsonb not null default '{}'::jsonb,
  print_layout_limit text default 'limited',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.plans_master add column if not exists source_access text not null default 'none';
alter table public.plans_master add column if not exists library_access_percent integer not null default 0;

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.plans_master(plan_id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'cancelled')),
  started_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  payment_id text,
  order_id text,
  granted_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month_key text not null,
  day_key text not null,
  downloads_used integer not null default 0,
  ai_generations_used integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, month_key, day_key)
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payment_id text not null unique,
  order_id text,
  amount numeric(10,2) not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_designs_created_at on public.designs (created_at desc);
create index if not exists idx_designs_category on public.designs (category);
create index if not exists idx_user_subscriptions_user_status on public.user_subscriptions (user_id, status, expires_at desc);
create index if not exists idx_user_usage_user_month on public.user_usage (user_id, month_key);
create index if not exists idx_user_usage_user_day on public.user_usage (user_id, day_key);
create index if not exists idx_purchases_user_design on public.purchases (user_id, design_id);

insert into public.plans_master (
  plan_id,
  name,
  price,
  duration_days,
  monthly_download_limit,
  daily_ai_limit,
  source_access,
  library_access_percent,
  tools_access,
  print_layout_limit
)
values
  (
    'starter_149_15d',
    'Starter Plan',
    149,
    15,
    10,
    2,
    'none',
    10,
    jsonb_build_object(
      'source_access', 'none',
      'design_library_access_percent', 10,
      'background_remover', 'basic',
      'image_enhancer', 'basic',
      'ai_output_quality', 'standard',
      'image_resizer', 'limited',
      'image_converter', 'limited',
      'ai_design_generator_limit', 2,
      'print_layout_pro', 'very_limited',
      'processing_speed', 'normal',
      'watermark', false
    ),
    'very_limited'
  ),
  (
    'basic_299_3m',
    'Basic Plan',
    299,
    90,
    30,
    5,
    'none',
    30,
    jsonb_build_object(
      'source_access', 'none',
      'design_library_access_percent', 30,
      'background_remover', 'basic',
      'image_enhancer', 'basic',
      'ai_output_quality', 'standard',
      'image_resizer', 'limited',
      'image_converter', 'limited',
      'ai_design_generator_limit', 5,
      'print_layout_pro', 'limited_templates',
      'processing_speed', 'normal',
      'watermark', false
    ),
    'limited_templates'
  ),
  (
    'advanced_599_6m',
    'Advanced Plan',
    599,
    180,
    100,
    20,
    'partial',
    70,
    jsonb_build_object(
      'source_access', 'partial',
      'design_library_access_percent', 70,
      'background_remover', 'high_quality',
      'image_enhancer', 'hd',
      'ai_output_quality', 'hd',
      'image_resizer', 'full',
      'image_converter', 'full',
      'ai_design_generator_limit', 20,
      'print_layout_pro', 'auto_layout_hd_export',
      'processing_speed', 'fast',
      'watermark', false
    ),
    'hd_export'
  ),
  (
    'ultimate_999_1y',
    'Ultimate Plan',
    999,
    365,
    -1,
    -1,
    'full',
    100,
    jsonb_build_object(
      'source_access', 'full',
      'design_library_access_percent', 100,
      'background_remover', 'ultra_ai',
      'image_enhancer', '4k',
      'ai_output_quality', '4k',
      'image_resizer', 'full',
      'image_converter', 'full',
      'ai_design_generator_limit', -1,
      'print_layout_pro', 'full_control_4k_export',
      'processing_speed', 'super_fast',
      'watermark', false
    ),
    'full_control_4k_export'
  )
on conflict (plan_id) do update
set
  name = excluded.name,
  price = excluded.price,
  duration_days = excluded.duration_days,
  monthly_download_limit = excluded.monthly_download_limit,
  daily_ai_limit = excluded.daily_ai_limit,
  source_access = excluded.source_access,
  library_access_percent = excluded.library_access_percent,
  tools_access = excluded.tools_access,
  print_layout_limit = excluded.print_layout_limit,
  updated_at = timezone('utc', now());

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.designs enable row level security;
alter table public.plans_master enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.user_usage enable row level security;
alter table public.purchases enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "designs_public_read" on public.designs;
create policy "designs_public_read"
on public.designs
for select
to anon, authenticated
using (true);

drop policy if exists "designs_admin_manage" on public.designs;
create policy "designs_admin_manage"
on public.designs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "plans_public_read" on public.plans_master;
create policy "plans_public_read"
on public.plans_master
for select
to anon, authenticated
using (true);

drop policy if exists "subscriptions_read_own_or_admin" on public.user_subscriptions;
create policy "subscriptions_read_own_or_admin"
on public.user_subscriptions
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "usage_read_own_or_admin" on public.user_usage;
create policy "usage_read_own_or_admin"
on public.user_usage
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "purchases_read_own_or_admin" on public.purchases;
create policy "purchases_read_own_or_admin"
on public.purchases
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_designs_updated_at on public.designs;
create trigger set_designs_updated_at
before update on public.designs
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_plans_master_updated_at on public.plans_master;
create trigger set_plans_master_updated_at
before update on public.plans_master
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_user_subscriptions_updated_at on public.user_subscriptions;
create trigger set_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_user_usage_updated_at on public.user_usage;
create trigger set_user_usage_updated_at
before update on public.user_usage
for each row execute function public.set_current_timestamp_updated_at();
