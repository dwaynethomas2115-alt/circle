-- OPTIONAL infrastructure for LiveKit room revocation. Run AFTER migrations.
-- Configure the two Vault secrets described in ROOMS.md BEFORE enabling rooms.
-- No secret values are committed to this file.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;
create schema if not exists private;

create or replace function private.deliver_circle_room_revocations()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_request bigint;
begin
  if not exists(select 1 from public.circle_call_revocations where delivered_at is null) then return null; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='circle_room_function_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='circle_room_hook_secret' limit 1;
  if v_url is null or v_secret is null or v_url !~ '^https://' then
    raise warning 'Circle room revocation delivery is not configured';
    return null;
  end if;
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-circle-room-secret',v_secret),
    body := '{"action":"drain"}'::jsonb,
    timeout_milliseconds := 15000
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function private.deliver_circle_room_revocations() from public,anon,authenticated;

create or replace function private.enqueue_circle_room_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.deliver_circle_room_revocations();
  return null;
exception when others then
  -- Never lose the persisted event or block a membership removal when networking
  -- fails. The minute worker retries every undelivered event until acknowledged.
  raise warning 'Circle room delivery deferred to the retry worker';
  return null;
end;
$$;
revoke all on function private.enqueue_circle_room_delivery() from public,anon,authenticated;
drop trigger if exists circle_room_delivery on public.circle_call_revocations;
create trigger circle_room_delivery after insert on public.circle_call_revocations
for each statement execute function private.enqueue_circle_room_delivery();

-- Reapplying this file replaces this application's named job, without affecting
-- any other scheduled work. Only an administrative database role can do this.
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname='circle-room-revocations';
end $$;
select cron.schedule('circle-room-revocations','* * * * *','select private.deliver_circle_room_revocations();');

-- After setup, test a real room removal with the two-account checklist in ROOMS.md.
-- Inspect only counts/timestamps; do not select decrypted Vault values or headers.
select count(*) as pending_revocations, min(created_at) as oldest_pending
from public.circle_call_revocations where delivered_at is null;
