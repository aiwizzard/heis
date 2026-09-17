-- Run against an isolated database after both migrations (with Supabase auth stubs).
begin;
set local request.jwt.claim.role = 'service_role';
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000001','plans-test@example.test');
do $$ declare u uuid:='00000000-0000-0000-0000-000000000001'; n integer; begin
 if exists(select 1 from public.trial_grants where user_id=u) or exists(select 1 from public.credit_wallets where user_id=u) then raise exception 'Signup gave free generation credits'; end if;
 if public.current_plan(u)<>'free' then raise exception 'Expected free plan'; end if;
 perform public.reserve_cloud_storage(u,'test/a','video/mp4',524288000);
 perform public.reserve_cloud_storage(u,'test/b','video/mp4',524288000);
 begin perform public.reserve_cloud_storage(u,'test/c','image/png',30000000); raise exception 'Quota failed open'; exception when raise_exception then if sqlerrm<>'STORAGE_LIMIT_REACHED' then raise; end if; end;
 begin insert into public.generation_jobs(id,user_id,provider,operation,model_id,idempotency_key) values(gen_random_uuid(),u,'runware','text-to-image','test','free-blocked'); raise exception 'Free generation allowed'; exception when raise_exception then if sqlerrm<>'SUBSCRIPTION_REQUIRED' then raise; end if; end;
 insert into public.subscriptions(user_id,stripe_subscription_id,stripe_customer_id,plan_id,status,current_period_end) values(u,'sub_test','cus_test','creator','active',now()+interval '1 month');
 if public.current_plan(u)<>'creator' then raise exception 'Expected creator'; end if;
 perform public.reserve_cloud_storage(u,'test/c','image/png',30000000);
 n:=public.grant_subscription_credits(u,'creator','invoice1','2026-09-17','2026-10-17'); if n<>2000 then raise exception 'Wrong grant'; end if;
 update public.credit_wallets set balance=500 where user_id=u;
 perform public.grant_subscription_credits(u,'creator','invoice1','2026-09-17','2026-10-17');
 perform public.grant_subscription_credits(u,'creator','invoiceDuplicatePeriod','2026-09-17','2026-10-17');
 if (select sum(balance) from public.credit_wallets where user_id=u)<>500 then raise exception 'Webhook replay restored spent credits'; end if;
 update public.subscriptions set status='past_due' where user_id=u;
 if public.current_plan(u)<>'free' then raise exception 'Past-due access retained'; end if;
 begin perform public.reserve_cloud_storage(u,'test/d','image/png',1); raise exception 'Downgrade quota failed'; exception when raise_exception then if sqlerrm<>'STORAGE_LIMIT_REACHED' then raise; end if; end;
 if not has_function_privilege('service_role','public.grant_subscription_credits(uuid,text,text,timestamptz,timestamptz)','execute') then raise exception 'Service cannot grant'; end if;
 if has_function_privilege('authenticated','public.grant_subscription_credits(uuid,text,text,timestamptz,timestamptz)','execute') then raise exception 'Client can mint credits'; end if;
end $$;
rollback;
