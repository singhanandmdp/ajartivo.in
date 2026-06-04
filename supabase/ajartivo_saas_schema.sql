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
  name text not null default '',
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
  weekly_premium_download_limit integer not null default 0,
  weekly_reset_date timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add column if not exists name text not null default '';
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists is_banned boolean not null default false;
alter table public.profiles add column if not exists is_premium boolean not null default false;
alter table public.profiles add column if not exists current_plan_id text;
alter table public.profiles add column if not exists premium_expiry timestamptz;
alter table public.profiles add column if not exists free_download_count integer not null default 0;
alter table public.profiles add column if not exists weekly_premium_download_count integer not null default 0;
alter table public.profiles add column if not exists weekly_premium_download_limit integer not null default 0;
alter table public.profiles add column if not exists weekly_reset_date timestamptz not null default timezone('utc', now());
alter table public.profiles add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.profiles add column if not exists updated_at timestamptz not null default timezone('utc', now());
alter table public.profiles alter column name set default '';
alter table public.profiles alter column name set not null;
alter table public.profiles alter column role set default 'user';
alter table public.profiles alter column role set not null;
alter table public.profiles alter column is_banned set default false;
alter table public.profiles alter column is_banned set not null;
alter table public.profiles alter column is_premium set default false;
alter table public.profiles alter column is_premium set not null;
alter table public.profiles alter column free_download_count set default 0;
alter table public.profiles alter column free_download_count set not null;
alter table public.profiles alter column weekly_premium_download_count set default 0;
alter table public.profiles alter column weekly_premium_download_count set not null;
alter table public.profiles alter column weekly_premium_download_limit set default 0;
alter table public.profiles alter column weekly_premium_download_limit set not null;
alter table public.profiles alter column weekly_reset_date set default timezone('utc', now());
alter table public.profiles alter column weekly_reset_date set not null;

update public.profiles
set email = lower(trim(coalesce(email, ''))),
    first_name = nullif(trim(coalesce(first_name, '')), ''),
    last_name = nullif(trim(coalesce(last_name, '')), ''),
    address = nullif(trim(coalesce(address, '')), ''),
    mobile_number = nullif(trim(coalesce(mobile_number, '')), ''),
    avatar_url = nullif(trim(coalesce(avatar_url, '')), ''),
    role = coalesce(nullif(lower(trim(coalesce(role, ''))), ''), 'user'),
    is_banned = coalesce(is_banned, false),
    is_premium = coalesce(is_premium, false),
    free_download_count = coalesce(free_download_count, 0),
    weekly_premium_download_count = coalesce(weekly_premium_download_count, 0),
    weekly_premium_download_limit = coalesce(weekly_premium_download_limit, 0),
    weekly_reset_date = coalesce(weekly_reset_date, timezone('utc', now())),
    created_at = coalesce(created_at, timezone('utc', now())),
    updated_at = coalesce(updated_at, timezone('utc', now())),
    name = coalesce(
      nullif(trim(coalesce(name, '')), ''),
      nullif(trim(concat_ws(' ', first_name, last_name)), ''),
      nullif(split_part(email, '@', 1), ''),
      'Creative Member'
    );

update public.profiles
set name = coalesce(
  nullif(trim(concat_ws(' ', first_name, last_name)), ''),
  nullif(split_part(email, '@', 1), ''),
  'Creative Member'
)
where name is null or trim(name) = '';

insert into public.profiles (
  id,
  email,
  name,
  first_name,
  last_name,
  address,
  mobile_number,
  avatar_url,
  role,
  is_banned,
  is_premium,
  current_plan_id,
  premium_expiry,
  free_download_count,
  weekly_premium_download_count,
  weekly_premium_download_limit,
  weekly_reset_date
)
select
  au.id,
  lower(trim(coalesce(au.email, ''))),
  coalesce(
    nullif(trim(coalesce(meta.metadata->>'full_name', meta.metadata->>'name')), ''),
    nullif(trim(concat_ws(' ',
      nullif(trim(coalesce(meta.metadata->>'first_name', meta.metadata->>'given_name', split_part(coalesce(au.email, ''), '@', 1))), ''),
      nullif(trim(coalesce(meta.metadata->>'last_name', meta.metadata->>'family_name', meta.metadata->>'surname')), '')
    )), ''),
    nullif(split_part(coalesce(au.email, ''), '@', 1), ''),
    'Creative Member'
  ),
  nullif(trim(coalesce(meta.metadata->>'first_name', meta.metadata->>'given_name', split_part(coalesce(au.email, ''), '@', 1))), ''),
  nullif(trim(coalesce(meta.metadata->>'last_name', meta.metadata->>'family_name', meta.metadata->>'surname')), ''),
  nullif(trim(coalesce(meta.metadata->>'address', meta.metadata->>'address_line', meta.metadata->>'location')), ''),
  nullif(trim(coalesce(meta.metadata->>'mobile_number', meta.metadata->>'phone_number', meta.metadata->>'phone')), ''),
  nullif(trim(coalesce(meta.metadata->>'avatar_url', meta.metadata->>'picture')), ''),
  coalesce(nullif(lower(trim(coalesce(meta.metadata->>'role', 'user'))), ''), 'user'),
  false,
  false,
  null,
  null,
  0,
  0,
  0,
  timezone('utc', now())
from auth.users au
left join public.profiles p
  on p.id = au.id
cross join lateral (
  select coalesce(au.raw_user_meta_data, '{}'::jsonb) as metadata
) meta
where p.id is null;

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
create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_profiles_is_premium on public.profiles (is_premium);
create index if not exists idx_profiles_current_plan_id on public.profiles (current_plan_id);
create index if not exists idx_profiles_weekly_premium_download_limit on public.profiles (weekly_premium_download_limit);
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

with active_subscription_snapshot as (
  select distinct on (us.user_id)
    us.user_id,
    us.plan_id,
    us.expires_at,
    pm.monthly_download_limit
  from public.user_subscriptions us
  left join public.plans_master pm
    on pm.plan_id = us.plan_id
  where us.status = 'active'
    and us.expires_at > timezone('utc', now())
  order by us.user_id, us.expires_at desc, us.created_at desc
)
update public.profiles p
set is_premium = true,
    current_plan_id = s.plan_id,
    premium_expiry = s.expires_at,
    weekly_premium_download_limit = greatest(coalesce(s.monthly_download_limit, 0), 0)
from active_subscription_snapshot s
where p.id = s.user_id;

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

revoke insert, update on public.profiles from authenticated;
grant insert (id, email, first_name, last_name, address, mobile_number, avatar_url) on public.profiles to authenticated;
grant update (email, first_name, last_name, address, mobile_number, avatar_url) on public.profiles to authenticated;
grant select on public.profiles to authenticated;

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

create or replace function public.sync_profile_identity_fields()
returns trigger
language plpgsql
as $$
declare
  derived_name text;
begin
  new.email := lower(trim(coalesce(new.email, '')));

  derived_name := trim(concat_ws(
    ' ',
    nullif(trim(coalesce(new.first_name, '')), ''),
    nullif(trim(coalesce(new.last_name, '')), '')
  ));

  if derived_name = '' then
    derived_name := nullif(trim(coalesce(new.name, '')), '');
  end if;

  if derived_name is null then
    derived_name := nullif(split_part(new.email, '@', 1), '');
  end if;

  new.name := coalesce(derived_name, 'Creative Member');
  return new;
end;
$$;

drop trigger if exists sync_profile_identity_fields on public.profiles;
create trigger sync_profile_identity_fields
before insert or update on public.profiles
for each row execute function public.sync_profile_identity_fields();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  metadata jsonb;
  derived_first_name text;
  derived_last_name text;
  derived_name text;
begin
  metadata := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  derived_first_name := nullif(trim(coalesce(metadata->>'first_name', metadata->>'given_name', split_part(coalesce(new.email, ''), '@', 1))), '');
  derived_last_name := nullif(trim(coalesce(metadata->>'last_name', metadata->>'family_name', metadata->>'surname')), '');
  derived_name := nullif(trim(coalesce(metadata->>'full_name', metadata->>'name')), '');

  if derived_name is null then
    derived_name := trim(concat_ws(' ', derived_first_name, derived_last_name));
  end if;

  insert into public.profiles (
    id,
    email,
    name,
    first_name,
    last_name,
    address,
    mobile_number,
    avatar_url,
    role,
    is_banned,
    is_premium,
    current_plan_id,
    premium_expiry,
    free_download_count,
    weekly_premium_download_count,
    weekly_premium_download_limit,
    weekly_reset_date
  )
  values (
    new.id,
    lower(trim(coalesce(new.email, ''))),
    coalesce(
      nullif(trim(derived_name), ''),
      nullif(trim(concat_ws(' ', derived_first_name, derived_last_name)), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Creative Member'
    ),
    derived_first_name,
    derived_last_name,
    nullif(trim(coalesce(metadata->>'address', metadata->>'address_line', metadata->>'location')), ''),
    nullif(trim(coalesce(metadata->>'mobile_number', metadata->>'phone_number', metadata->>'phone')), ''),
    nullif(trim(coalesce(metadata->>'avatar_url', metadata->>'picture')), ''),
    coalesce(nullif(lower(trim(coalesce(metadata->>'role', 'user'))), ''), 'user'),
    false,
    false,
    null,
    null,
    0,
    0,
    0,
    timezone('utc', now())
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    address = coalesce(excluded.address, public.profiles.address),
    mobile_number = coalesce(excluded.mobile_number, public.profiles.mobile_number),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    role = coalesce(public.profiles.role, excluded.role),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists handle_new_auth_user on auth.users;
create trigger handle_new_auth_user
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.sync_profile_subscription_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  active_subscription record;
begin
  if tg_op = 'DELETE' then
    target_user_id := old.user_id;
  else
    target_user_id := new.user_id;
  end if;

  select
    us.plan_id,
    us.expires_at,
    pm.monthly_download_limit
  into active_subscription
  from public.user_subscriptions us
  left join public.plans_master pm
    on pm.plan_id = us.plan_id
  where us.user_id = target_user_id
    and us.status = 'active'
    and us.expires_at > timezone('utc', now())
  order by us.expires_at desc, us.created_at desc
  limit 1;

  if found then
    update public.profiles
    set
      is_premium = true,
      current_plan_id = active_subscription.plan_id,
      premium_expiry = active_subscription.expires_at,
      weekly_premium_download_limit = greatest(coalesce(active_subscription.monthly_download_limit, 0), 0),
      updated_at = timezone('utc', now())
    where id = target_user_id;
  else
    update public.profiles
    set
      is_premium = false,
      current_plan_id = null,
      premium_expiry = null,
      weekly_premium_download_limit = 0,
      updated_at = timezone('utc', now())
    where id = target_user_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_profile_subscription_snapshot on public.user_subscriptions;
create trigger sync_profile_subscription_snapshot
after insert or update or delete on public.user_subscriptions
for each row execute function public.sync_profile_subscription_snapshot();

create or replace view public.profile_dashboard as
with current_cycle as (
  select
    to_char(timezone('utc', now()), 'YYYY-MM') as month_key,
    to_char(timezone('utc', now()), 'YYYY-MM-DD') as day_key
),
active_subscription as (
  select distinct on (us.user_id)
    us.user_id,
    us.id as subscription_id,
    us.plan_id,
    us.status,
    us.expires_at,
    us.started_at,
    us.payment_id,
    us.order_id,
    us.metadata,
    pm.name as plan_name,
    pm.monthly_download_limit,
    pm.daily_ai_limit,
    pm.source_access,
    pm.library_access_percent,
    pm.tools_access,
    pm.print_layout_limit
  from public.user_subscriptions us
  left join public.plans_master pm
    on pm.plan_id = us.plan_id
  where us.status = 'active'
  order by us.user_id, us.expires_at desc, us.created_at desc
),
month_usage as (
  select
    uu.user_id,
    sum(coalesce(uu.downloads_used, 0))::int as downloads_used_month
  from public.user_usage uu
  join current_cycle cc
    on cc.month_key = uu.month_key
  group by uu.user_id
),
day_usage as (
  select
    uu.user_id,
    sum(coalesce(uu.ai_generations_used, 0))::int as ai_generations_used_today
  from public.user_usage uu
  join current_cycle cc
    on cc.month_key = uu.month_key
   and cc.day_key = uu.day_key
  group by uu.user_id
)
select
  p.id,
  p.email,
  coalesce(
    nullif(trim(p.name), ''),
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    nullif(split_part(p.email, '@', 1), ''),
    'Creative Member'
  ) as name,
  p.first_name,
  p.last_name,
  p.address,
  p.mobile_number,
  p.avatar_url,
  p.role,
  p.is_banned,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then true
    else false
  end as premium_active,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then true
    else coalesce(p.is_premium, false)
  end as is_premium,
  coalesce(asub.plan_id, p.current_plan_id, '') as active_plan_id,
  coalesce(asub.plan_name, 'Free') as active_plan_name,
  coalesce(asub.expires_at, p.premium_expiry) as premium_expiry,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then coalesce(asub.monthly_download_limit, p.weekly_premium_download_limit, 0)
    else 0
  end as monthly_download_limit,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then coalesce(asub.monthly_download_limit, p.weekly_premium_download_limit, 0)
    else 0
  end as weekly_premium_download_limit,
  coalesce(mu.downloads_used_month, 0) as downloads_used_month,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then case
        when coalesce(asub.monthly_download_limit, 0) < 0 then -1
        else greatest(coalesce(asub.monthly_download_limit, 0) - coalesce(mu.downloads_used_month, 0), 0)
      end
    else -1
  end as downloads_remaining_month,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then coalesce(asub.daily_ai_limit, 0)
    else 2
  end as daily_ai_limit,
  coalesce(du.ai_generations_used_today, 0) as ai_generations_used_today,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then case
        when coalesce(asub.daily_ai_limit, 0) < 0 then -1
        else greatest(coalesce(asub.daily_ai_limit, 0) - coalesce(du.ai_generations_used_today, 0), 0)
      end
    else 2
  end as ai_remaining_today,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then coalesce(asub.source_access, 'none')
    else 'none'
  end as source_access,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then coalesce(asub.library_access_percent, 100)
    else 5
  end as library_access_percent,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then coalesce(asub.tools_access, '{}'::jsonb)
    else jsonb_build_object(
      'source_access', 'none',
      'design_library_access_percent', 5,
      'background_remover', 'starter',
      'image_enhancer', 'starter',
      'image_resizer', 'starter',
      'image_converter', 'starter',
      'print_layout_pro', 'starter',
      'processing_speed', 'normal',
      'watermark', true
    )
  end as tools_access,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then coalesce(asub.print_layout_limit, 'starter')
    else 'starter'
  end as print_layout_limit,
  coalesce(p.free_download_count, 0) as free_download_count,
  -1 as free_download_limit,
  -1 as free_download_remaining,
  coalesce(p.weekly_premium_download_count, 0) as weekly_premium_download_count,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then case
        when coalesce(asub.monthly_download_limit, 0) < 0 then -1
        else greatest(coalesce(asub.monthly_download_limit, 0) - coalesce(mu.downloads_used_month, 0), 0)
      end
    else 0
  end as weekly_premium_remaining,
  p.weekly_reset_date,
  case
    when coalesce(asub.expires_at, p.premium_expiry) > timezone('utc', now())
     and coalesce(asub.status, 'active') = 'active'
      then concat(coalesce(asub.plan_name, 'Premium'), ' Active')
    else 'Free Member'
  end as premium_badge,
  (coalesce(p.free_download_count, 0) + coalesce(mu.downloads_used_month, 0))::int as total_download_count,
  p.current_plan_id,
  p.created_at,
  p.updated_at
from public.profiles p
left join active_subscription asub on asub.user_id = p.id
left join month_usage mu on mu.user_id = p.id
left join day_usage du on du.user_id = p.id;
