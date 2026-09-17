-- Free desktop access; only active subscriptions can spend monthly generation credits.
create table public.plan_limits (
  id text primary key check (id in ('free','creator','pro')),
  monthly_usd integer not null, monthly_credits integer not null, storage_bytes bigint not null
);
insert into public.plan_limits values ('free',0,0,1073741824),('creator',24,2000,26843545600),('pro',59,6000,107374182400);
alter table public.plan_limits enable row level security;
create policy plans_read on public.plan_limits for select using (true);
alter table public.subscriptions add column plan_id text references public.plan_limits(id);
-- Existing test-era subscriptions must be synchronized from a recognized Stripe price.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,email) values(new.id,new.email);
  return new;
end; $$;
-- Retire historical trial grants without deleting project or media data.
update public.entitlements set active=false;
update public.credit_wallets set balance=0 where kind in ('trial','purchased');

create or replace function public.current_plan(p_user_id uuid) returns text language sql stable security definer set search_path=public as $$
 select coalesce((select plan_id from public.subscriptions where user_id=p_user_id and status='active' and current_period_end>now() and plan_id in ('creator','pro')), 'free');
$$;

create table public.subscription_credit_periods (
 user_id uuid references public.profiles(id) on delete cascade,
 period_start timestamptz not null, invoice_id text not null unique,
 primary key(user_id,period_start)
);
alter table public.subscription_credit_periods enable row level security;

create or replace function public.grant_subscription_credits(p_user_id uuid,p_plan text,p_invoice_id text,p_period_start timestamptz,p_period_end timestamptz)
returns integer language plpgsql security definer set search_path=public as $$
declare allowance integer; wallet_id uuid; inserted_count integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if p_plan not in ('creator','pro') or p_period_end<=p_period_start then raise exception 'Invalid subscription period'; end if;
 perform pg_advisory_xact_lock(hashtext(p_user_id::text));
 insert into public.subscription_credit_periods(user_id,period_start,invoice_id) values(p_user_id,p_period_start,p_invoice_id) on conflict do nothing;
 get diagnostics inserted_count=row_count;
 if inserted_count=0 then return 0; end if;
 select monthly_credits into allowance from public.plan_limits where id=p_plan;
 insert into public.credit_wallets(user_id,kind,source_id,balance,granted_credits,expires_at)
 values(p_user_id,'monthly',p_invoice_id,allowance,allowance,p_period_end)
 on conflict(user_id,kind,source_id) do nothing returning id into wallet_id;
 get diagnostics inserted_count=row_count;
 if inserted_count=0 then return 0; end if;
 insert into public.credit_ledger(user_id,wallet_id,kind,amount,idempotency_key)
 values(p_user_id,wallet_id,'grant',allowance,'stripe:'||p_invoice_id);
 return allowance;
end; $$;

create or replace function public.reserve_cloud_storage(p_user_id uuid,p_object_key text,p_mime_type text,p_size_bytes bigint)
returns void language plpgsql security definer set search_path=public as $$
declare quota bigint; used bigint; existing public.upload_assets;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if p_size_bytes<=0 or p_size_bytes>524288000 then raise exception 'Invalid asset size'; end if;
 perform pg_advisory_xact_lock(hashtext(p_user_id::text));
 select * into existing from public.upload_assets where object_key=p_object_key;
 if found then
   if existing.user_id<>p_user_id or existing.size_bytes<>p_size_bytes or existing.mime_type<>p_mime_type then raise exception 'Upload request changed'; end if;
   update public.upload_assets set created_at=now() where id=existing.id;
   return;
 end if;
 if p_object_key like 'users/%/jobs/%' and p_object_key not like '%/reservation' then
   delete from public.upload_assets where user_id=p_user_id and object_key=regexp_replace(p_object_key,'/[^/]+$','/reservation');
 end if;
 select storage_bytes into quota from public.plan_limits where id=public.current_plan(p_user_id);
 select coalesce((select sum(size_bytes) from public.upload_assets where user_id=p_user_id),0)+coalesce((select sum(size_bytes) from public.media_assets where user_id=p_user_id),0) into used;
 if used+p_size_bytes>quota then raise exception 'STORAGE_LIMIT_REACHED'; end if;
 insert into public.upload_assets(user_id,object_key,mime_type,size_bytes) values(p_user_id,p_object_key,p_mime_type,p_size_bytes);
end; $$;

create or replace function public.finalize_cloud_output(p_user_id uuid,p_job_id uuid,p_object_key text,p_source_url text,p_kind text)
returns void language plpgsql security definer set search_path=public as $$
declare reserved public.upload_assets;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 perform pg_advisory_xact_lock(hashtext(p_user_id::text));
 select * into reserved from public.upload_assets where user_id=p_user_id and object_key=p_object_key for update;
 if not found then
   if exists(select 1 from public.media_assets where user_id=p_user_id and object_key=p_object_key) then return; end if;
   raise exception 'Storage reservation missing';
 end if;
 insert into public.media_assets(user_id,job_id,object_key,source_url,kind,mime_type,size_bytes)
 values(p_user_id,p_job_id,p_object_key,p_source_url,p_kind,reserved.mime_type,reserved.size_bytes);
 delete from public.upload_assets where id=reserved.id;
end; $$;

-- Enforce access even if a caller bypasses the HTTP endpoint and calls the RPC.
create or replace function public.check_generation_subscription() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if public.current_plan(new.user_id)='free' then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
 return new;
end; $$;
create trigger generation_subscription_before_insert before insert on public.generation_jobs for each row execute function public.check_generation_subscription();

revoke all on function public.current_plan(uuid) from public,anon,authenticated;
revoke all on function public.grant_subscription_credits(uuid,text,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.reserve_cloud_storage(uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function public.finalize_cloud_output(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.current_plan(uuid) to service_role;
grant execute on function public.grant_subscription_credits(uuid,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.reserve_cloud_storage(uuid,text,text,bigint) to service_role;
grant execute on function public.finalize_cloud_output(uuid,uuid,text,text,text) to service_role;
-- Refunds and settlements are backend operations; cancellation remains the user-facing RPC.
revoke all on function public.release_generation_credits(uuid,text) from public,anon,authenticated;
revoke all on function public.settle_generation_credits(uuid,integer,numeric) from public,anon,authenticated;
grant execute on function public.release_generation_credits(uuid,text) to service_role;
grant execute on function public.settle_generation_credits(uuid,integer,numeric) to service_role;

create or replace function public.reserve_generation_credits(p_job_id uuid, p_amount integer, p_idempotency_key text)
returns integer language plpgsql security definer set search_path = public as $$
declare wallet record; remaining integer := p_amount; debit integer; owner uuid;
begin
  if p_amount <= 0 then return 0; end if;
  select user_id into owner from public.generation_jobs where id = p_job_id for update;
  if owner is null or (auth.uid() is distinct from owner and auth.role() is distinct from 'service_role') then raise exception 'Generation job not found'; end if;
  if public.current_plan(owner)='free' then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
  if exists(select 1 from public.generation_credit_allocations where job_id = p_job_id) then
    return (select coalesce(sum(reserved), 0)::integer from public.generation_credit_allocations where job_id = p_job_id);
  end if;
  for wallet in select * from public.credit_wallets where user_id = owner and balance > 0 and kind = 'monthly'
    and expires_at > now()
    order by expires_at, created_at for update loop
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

revoke all on function public.reserve_generation_credits(uuid,integer,text) from public,anon;
grant execute on function public.reserve_generation_credits(uuid,integer,text) to authenticated,service_role;
