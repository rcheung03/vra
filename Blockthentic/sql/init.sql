create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text,
  created_at timestamp with time zone default now()
);

create table if not exists registries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  template_type text not null,
  profile text,
  chain text not null,
  contract_address text,
  revocation_address text,
  deploy_tx_hash text,
  deployment_status text default 'pending',
  deployment_source text,
  access_mode text,
  required_approvals integer default 1,
  config_hash text,
  template_config text,
  created_at timestamp with time zone default now()
);

create table if not exists registry_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  registry_id uuid references registries(id) on delete cascade,
  template_type text not null,
  doc_id text not null,
  doc_hash text not null,
  resource_uri text,
  tx_hash text,
  file_name text,
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_username text,
  registered_by_user_id uuid references auth.users(id) on delete set null,
  registered_by_username text,
  signer_rule_label text,
  metadata_json jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists registry_memberships (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references registries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'user')),
  status text not null default 'active' check (status in ('active', 'pending', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (registry_id, user_id)
);

alter table registry_records
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_username text,
  add column if not exists registered_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists registered_by_username text,
  add column if not exists signer_rule_label text,
  add column if not exists metadata_json jsonb;

create unique index if not exists idx_profiles_username_unique on profiles (lower(username));
create index if not exists idx_registries_owner on registries(owner_id);
create index if not exists idx_records_owner on registry_records(owner_id);
create index if not exists idx_records_registry on registry_records(registry_id);
create index if not exists idx_records_hash on registry_records(doc_hash);
create index if not exists idx_records_assigned_user on registry_records(assigned_user_id);
create index if not exists idx_memberships_registry on registry_memberships(registry_id);
create index if not exists idx_memberships_user on registry_memberships(user_id);

create or replace function public.is_registry_owner(p_registry_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.registries r
    where r.id = p_registry_id
      and r.owner_id = p_user_id
  );
$$;

create or replace function public.is_registry_member(p_registry_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.registry_memberships rm
    where rm.registry_id = p_registry_id
      and rm.user_id = p_user_id
      and rm.status = 'active'
  );
$$;

create or replace function public.registry_member_role(p_registry_id uuid, p_user_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select rm.role
  from public.registry_memberships rm
  where rm.registry_id = p_registry_id
    and rm.user_id = p_user_id
    and rm.status = 'active'
  limit 1;
$$;

grant execute on function public.is_registry_owner(uuid, uuid) to authenticated;
grant execute on function public.is_registry_member(uuid, uuid) to authenticated;
grant execute on function public.registry_member_role(uuid, uuid) to authenticated;

alter table profiles enable row level security;
alter table registries enable row level security;
alter table registry_records enable row level security;
alter table registry_memberships enable row level security;

drop policy if exists "Profiles are viewable by owner" on profiles;
drop policy if exists "Profiles are viewable by authenticated users" on profiles;
create policy "Profiles are viewable by authenticated users" on profiles
for select to authenticated using (true);

drop policy if exists "Profiles are insertable by owner" on profiles;
create policy "Profiles are insertable by owner" on profiles
for insert with check (auth.uid() = id);

drop policy if exists "Registries are viewable by owner" on registries;
drop policy if exists "Registries are viewable by owner member or public" on registries;
create policy "Registries are viewable by owner member or public" on registries
for select using (
  auth.uid() = owner_id
  or access_mode = 'public_read'
  or public.is_registry_member(id, auth.uid())
);

drop policy if exists "Registries are insertable by owner" on registries;
create policy "Registries are insertable by owner" on registries
for insert with check (auth.uid() = owner_id);

drop policy if exists "Registry records are viewable by owner" on registry_records;
drop policy if exists "Registry records are viewable by authorized users" on registry_records;
create policy "Registry records are viewable by authorized users" on registry_records
for select using (
  auth.uid() = owner_id
  or auth.uid() = assigned_user_id
  or exists (
    select 1
    from registries r
    where r.id = registry_records.registry_id
      and (
        r.access_mode = 'public_read'
        or r.owner_id = auth.uid()
        or public.is_registry_member(r.id, auth.uid())
      )
  )
);

drop policy if exists "Registry records are insertable by owner" on registry_records;
drop policy if exists "Registry records are insertable by owner or admin" on registry_records;
create policy "Registry records are insertable by owner or admin" on registry_records
for insert with check (
  auth.uid() = registered_by_user_id
  and exists (
    select 1
    from registries r
    where r.id = registry_records.registry_id
      and (
        r.owner_id = auth.uid()
        or public.registry_member_role(r.id, auth.uid()) = 'admin'
      )
  )
);

drop policy if exists "Registry memberships are viewable by members and owner" on registry_memberships;
create policy "Registry memberships are viewable by members and owner" on registry_memberships
for select using (
  auth.uid() = user_id
  or public.is_registry_owner(registry_id, auth.uid())
);

drop policy if exists "Registry memberships are insertable by owner" on registry_memberships;
create policy "Registry memberships are insertable by owner" on registry_memberships
for insert with check (
  public.is_registry_owner(registry_id, auth.uid())
);

drop policy if exists "Registry memberships are updatable by owner" on registry_memberships;
create policy "Registry memberships are updatable by owner" on registry_memberships
for update using (
  public.is_registry_owner(registry_id, auth.uid())
) with check (
  public.is_registry_owner(registry_id, auth.uid())
);

drop policy if exists "Registry memberships are deletable by owner" on registry_memberships;
create policy "Registry memberships are deletable by owner" on registry_memberships
for delete using (
  public.is_registry_owner(registry_id, auth.uid())
);

