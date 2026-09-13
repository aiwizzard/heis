create extension if not exists pgcrypto;

create type public.entitlement_kind as enum ('trial', 'lifetime', 'creator');
create type public.wallet_kind as enum ('trial', 'monthly', 'purchased');
create type public.generation_status as enum ('queued', 'submitted', 'running', 'succeeded', 'failed', 'cancelled');
create type public.ledger_entry_kind as enum ('grant', 'reservation', 'settlement', 'release', 'expiration', 'adjustment');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id) on delete cascade,
  stripe_subscription_id text not null unique, stripe_customer_id text not null, status text not null,
  current_period_start timestamptz, current_period_end timestamptz, cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.entitlements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.entitlement_kind not null, active boolean not null default true, source_id text,
  starts_at timestamptz not null default now(), ends_at timestamptz, created_at timestamptz not null default now(), unique (user_id, kind)
);
create table public.device_activations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  installation_id text not null, device_name text not null, activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(), deactivated_at timestamptz, unique (user_id, installation_id)
);
create table public.trial_grants (
  user_id uuid primary key references public.profiles(id) on delete cascade, credits integer not null default 100 check (credits = 100),
  issued_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '14 days')
);
create table public.credit_wallets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.wallet_kind not null, source_id text not null, balance integer not null check (balance >= 0),
  granted_credits integer not null check (granted_credits > 0), expires_at timestamptz,
  created_at timestamptz not null default now(), unique (user_id, kind, source_id)
);
create table public.generation_jobs (
  id uuid primary key, user_id uuid not null references public.profiles(id) on delete cascade, provider text not null,
  provider_job_id text unique, operation text not null, model_id text not null,
  status public.generation_status not null default 'queued', request_payload jsonb not null default '{}'::jsonb,
  reserved_credits integer not null default 0 check (reserved_credits >= 0), settled_credits integer check (settled_credits >= 0),
  provider_cost_usd numeric(14, 8), error_code text, error_message text, idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, idempotency_key)
);
create table public.generation_credit_allocations (
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  wallet_id uuid not null references public.credit_wallets(id), reserved integer not null check (reserved > 0),
  settled integer not null default 0 check (settled >= 0), primary key (job_id, wallet_id)
);
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_id uuid references public.credit_wallets(id), job_id uuid references public.generation_jobs(id),
  kind public.ledger_entry_kind not null, amount integer not null, idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique (user_id, idempotency_key, wallet_id, kind)
);
create table public.media_assets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.generation_jobs(id) on delete set null, kind text not null, object_key text not null unique,
  source_url text, mime_type text, size_bytes bigint, width integer, height integer, duration_seconds numeric,
  delete_after timestamptz not null default (now() + interval '30 days'), created_at timestamptz not null default now()
);
create table public.upload_assets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  object_key text not null unique, mime_type text not null, size_bytes bigint not null check (size_bytes > 0),
  delete_after timestamptz not null default (now() + interval '30 days'), created_at timestamptz not null default now()
);
create table public.processed_webhooks (
  provider text not null, event_id text not null, status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  attempts integer not null default 1, last_error text, received_at timestamptz not null default now(), processed_at timestamptz,
  primary key (provider, event_id)
);

create or replace function public.claim_webhook(p_provider text, p_event_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare inserted_count integer; current_status text; current_received_at timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  insert into public.processed_webhooks(provider, event_id, status, attempts)
    values (p_provider, p_event_id, 'processing', 1)
    on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then return true; end if;

  select status, received_at into current_status, current_received_at
    from public.processed_webhooks where provider = p_provider and event_id = p_event_id for update;
  if current_status = 'processed' then return false; end if;
  if current_status = 'processing' and current_received_at > now() - interval '10 minutes' then return false; end if;
  update public.processed_webhooks
    set status = 'processing', attempts = attempts + 1, last_error = null, received_at = now(), processed_at = null
    where provider = p_provider and event_id = p_event_id;
  return true;
end;
$$;

create index generation_jobs_user_created_idx on public.generation_jobs(user_id, created_at desc);
create index media_assets_delete_after_idx on public.media_assets(delete_after);
create index upload_assets_delete_after_idx on public.upload_assets(delete_after);
create unique index media_assets_job_source_idx on public.media_assets(job_id, source_url) where source_url is not null;
create index active_devices_idx on public.device_activations(user_id) where deactivated_at is null;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();
create trigger generation_jobs_touch before update on public.generation_jobs for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare trial_source text := 'trial:' || new.id::text;
begin
  insert into public.profiles(id, email) values (new.id, new.email);
  insert into public.trial_grants(user_id) values (new.id);
  insert into public.entitlements(user_id, kind, active, ends_at) values (new.id, 'trial', true, now() + interval '14 days');
  insert into public.credit_wallets(user_id, kind, source_id, balance, granted_credits, expires_at)
    values (new.id, 'trial', trial_source, 100, 100, now() + interval '14 days');
  insert into public.credit_ledger(user_id, wallet_id, kind, amount, idempotency_key)
    select new.id, id, 'grant', 100, trial_source from public.credit_wallets where user_id = new.id and source_id = trial_source;
  return new;
end;
$$;
create trigger auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.activate_device(p_installation_id text, p_device_name text)
returns public.device_activations language plpgsql security definer set search_path = public as $$
declare result public.device_activations; active_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_installation_id)) < 8 then raise exception 'Invalid installation identifier'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select count(*) into active_count from public.device_activations
    where user_id = auth.uid() and deactivated_at is null and installation_id <> p_installation_id;
  if active_count >= 3 then raise exception 'Three Macs are already active for this account'; end if;
  insert into public.device_activations(user_id, installation_id, device_name)
    values (auth.uid(), p_installation_id, left(p_device_name, 120))
    on conflict (user_id, installation_id) do update
      set device_name = excluded.device_name, last_seen_at = now(), deactivated_at = null returning * into result;
  return result;
end;
$$;

create or replace function public.deactivate_device(p_installation_id text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.device_activations set deactivated_at = now()
    where user_id = auth.uid() and installation_id = p_installation_id and deactivated_at is null;
  return found;
end;
$$;

create or replace function public.reserve_generation_credits(p_job_id uuid, p_amount integer, p_idempotency_key text)
returns integer language plpgsql security definer set search_path = public as $$
declare wallet record; remaining integer := p_amount; debit integer; owner uuid;
begin
  if p_amount <= 0 then return 0; end if;
  select user_id into owner from public.generation_jobs where id = p_job_id for update;
  if owner is null or (auth.uid() <> owner and auth.role() <> 'service_role') then raise exception 'Generation job not found'; end if;
  if exists(select 1 from public.generation_credit_allocations where job_id = p_job_id) then
    return (select coalesce(sum(reserved), 0)::integer from public.generation_credit_allocations where job_id = p_job_id);
  end if;
  for wallet in select * from public.credit_wallets where user_id = owner and balance > 0
    and (expires_at is null or expires_at > now())
    order by case kind when 'trial' then 0 when 'monthly' then 1 else 2 end, expires_at nulls last, created_at for update loop
    exit when remaining = 0;
    debit := least(wallet.balance, remaining);
    update public.credit_wallets set balance = balance - debit where id = wallet.id;
    insert into public.generation_credit_allocations(job_id, wallet_id, reserved) values (p_job_id, wallet.id, debit);
    insert into public.credit_ledger(user_id, wallet_id, job_id, kind, amount, idempotency_key)
      values (owner, wallet.id, p_job_id, 'reservation', -debit, p_idempotency_key);
    remaining := remaining - debit;
  end loop;
  if remaining > 0 then raise exception 'INSUFFICIENT_CREDITS'; end if;
  return p_amount;
end;
$$;

create or replace function public.release_generation_credits(p_job_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare allocation record; owner uuid; released integer := 0;
begin
  select user_id into owner from public.generation_jobs where id = p_job_id for update;
  if owner is null or (auth.uid() <> owner and auth.role() <> 'service_role') then raise exception 'Generation job not found'; end if;
  for allocation in select * from public.generation_credit_allocations where job_id = p_job_id and settled = 0 for update loop
    update public.credit_wallets set balance = balance + allocation.reserved where id = allocation.wallet_id;
    update public.generation_credit_allocations set settled = reserved where job_id = p_job_id and wallet_id = allocation.wallet_id;
    insert into public.credit_ledger(user_id, wallet_id, job_id, kind, amount, idempotency_key, metadata)
      values (owner, allocation.wallet_id, p_job_id, 'release', allocation.reserved, p_job_id::text || ':release', jsonb_build_object('reason', p_reason)) on conflict do nothing;
    released := released + allocation.reserved;
  end loop;
  return released;
end;
$$;

create or replace function public.cancel_generation_job(p_job_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare owner uuid; current_status public.generation_status;
begin
  select user_id, status into owner, current_status from public.generation_jobs where id = p_job_id for update;
  if owner is null or auth.uid() <> owner then raise exception 'Generation job not found'; end if;
  if current_status = 'cancelled' then return true; end if;
  if current_status not in ('queued', 'submitted') then raise exception 'Generation job cannot be cancelled'; end if;
  perform public.release_generation_credits(p_job_id, 'user_cancelled');
  update public.generation_jobs set status = 'cancelled' where id = p_job_id;
  return true;
end;
$$;

create or replace function public.settle_generation_credits(p_job_id uuid, p_final_credits integer, p_provider_cost numeric)
returns integer language plpgsql security definer set search_path = public as $$
declare allocation record; owner uuid; remaining integer := p_final_credits; used integer; refund integer; already_settled integer;
begin
  select user_id, settled_credits into owner, already_settled from public.generation_jobs where id = p_job_id for update;
  if owner is null or auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_final_credits < 0 then raise exception 'Invalid final credit amount'; end if;
  if already_settled is not null then return already_settled; end if;
  for allocation in select * from public.generation_credit_allocations where job_id = p_job_id order by reserved desc for update loop
    used := least(allocation.reserved, remaining); refund := allocation.reserved - used;
    if refund > 0 then
      update public.credit_wallets set balance = balance + refund where id = allocation.wallet_id;
      insert into public.credit_ledger(user_id, wallet_id, job_id, kind, amount, idempotency_key)
        values (owner, allocation.wallet_id, p_job_id, 'release', refund, p_job_id::text || ':settlement-release') on conflict do nothing;
    end if;
    update public.generation_credit_allocations set settled = used where job_id = p_job_id and wallet_id = allocation.wallet_id;
    insert into public.credit_ledger(user_id, wallet_id, job_id, kind, amount, idempotency_key)
      values (owner, allocation.wallet_id, p_job_id, 'settlement', used, p_job_id::text || ':settlement') on conflict do nothing;
    remaining := remaining - used;
  end loop;
  if remaining > 0 then raise exception 'Final cost exceeds reserved maximum'; end if;
  update public.generation_jobs set settled_credits = p_final_credits, provider_cost_usd = p_provider_cost where id = p_job_id;
  return p_final_credits;
end;
$$;

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.device_activations enable row level security;
alter table public.trial_grants enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_credit_allocations enable row level security;
alter table public.media_assets enable row level security;
alter table public.upload_assets enable row level security;

create policy profiles_read_own on public.profiles for select using (id = auth.uid());
create policy subscriptions_read_own on public.subscriptions for select using (user_id = auth.uid());
create policy entitlements_read_own on public.entitlements for select using (user_id = auth.uid());
create policy devices_read_own on public.device_activations for select using (user_id = auth.uid());
create policy trials_read_own on public.trial_grants for select using (user_id = auth.uid());
create policy wallets_read_own on public.credit_wallets for select using (user_id = auth.uid());
create policy ledger_read_own on public.credit_ledger for select using (user_id = auth.uid());
create policy jobs_read_own on public.generation_jobs for select using (user_id = auth.uid());
create policy jobs_insert_own on public.generation_jobs for insert with check (user_id = auth.uid());
create policy allocations_read_own on public.generation_credit_allocations for select using
  (exists(select 1 from public.generation_jobs j where j.id = job_id and j.user_id = auth.uid()));
create policy assets_read_own on public.media_assets for select using (user_id = auth.uid());
create policy uploads_read_own on public.upload_assets for select using (user_id = auth.uid());

revoke update, delete on public.credit_ledger from authenticated, anon;
revoke insert, update, delete on public.credit_wallets from authenticated, anon;
grant execute on function public.activate_device(text, text) to authenticated;
grant execute on function public.deactivate_device(text) to authenticated;
grant execute on function public.reserve_generation_credits(uuid, integer, text) to authenticated;
grant execute on function public.release_generation_credits(uuid, text) to authenticated;
grant execute on function public.cancel_generation_job(uuid) to authenticated;
revoke all on function public.claim_webhook(text, text) from public, anon, authenticated;
grant execute on function public.claim_webhook(text, text) to service_role;
