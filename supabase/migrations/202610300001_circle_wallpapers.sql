-- Add full AI wallpapers without making Circle media public.
alter table public.circle_theme_generation_requests
  add column status text not null default 'pending' check(status in ('pending','completed','failed')),
  add column finished_at timestamptz;
update public.circle_theme_generation_requests set status=case when proposal is null then 'failed' else 'completed' end,finished_at=created_at;

create or replace function public.validate_circle_theme(p_theme jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare v_key text;
begin
 if p_theme is null or jsonb_typeof(p_theme)<>'object' or (select count(*) from jsonb_object_keys(p_theme)) not between 9 and 10 then return false; end if;
 for v_key in select jsonb_object_keys(p_theme) loop
  if v_key not in ('id','label','prompt','accent','background','surface','ink','motif','source','wallpaperPath') or jsonb_typeof(p_theme->v_key)<>'string' then return false; end if;
 end loop;
 if not (p_theme ?& array['id','label','prompt','accent','background','surface','ink','motif','source']) then return false; end if;
 if p_theme->>'id' !~ '^[a-zA-Z0-9_-]{1,80}$' or length(trim(p_theme->>'label')) not between 3 and 60 or length(p_theme->>'prompt')>1000 then return false; end if;
 if p_theme->>'motif' not in ('garden','unicorn','vegas','coast','minimal') or p_theme->>'source' not in ('preset','ai') then return false; end if;
 if p_theme ? 'wallpaperPath' and (p_theme->>'source'<>'ai' or p_theme->>'wallpaperPath' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$') then return false; end if;
 return public.theme_luminance(p_theme->>'background')>=0.8 and public.theme_luminance(p_theme->>'surface')>=0.85 and public.theme_contrast(p_theme->>'ink',p_theme->>'surface')>=4.5 and public.theme_contrast(p_theme->>'ink',p_theme->>'background')>=4.5 and public.theme_contrast('#FFFFFF',p_theme->>'accent')>=4.5;
exception when others then return false;
end;
$$;

-- The server supplies an already-verified user and bounded deployment settings.
-- Neither the app nor an authenticated API caller can choose their own budget.
create function public.reserve_theme_wallpaper_generation(p_circle uuid,p_user uuid,p_daily_limit integer default 50,p_burst_limit integer default 3) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_count integer;v_reset timestamptz;v_now timestamptz:=clock_timestamp();
begin
 if p_daily_limit not between 1 and 200 or p_burst_limit not between 1 and 10 then raise exception 'Invalid theme generation configuration'; end if;
 if not exists(select 1 from public.circle_members where circle_id=p_circle and user_id=p_user and role in ('owner','admin')) then raise exception 'Manager access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('theme-user:'||p_user::text,0));
 -- An abandoned reservation stops holding a daily slot after ten minutes.
 update public.circle_theme_generation_requests set status='failed',finished_at=v_now where user_id=p_user and status='pending' and created_at<=v_now-interval '10 minutes';
 select count(*),min(created_at)+interval '10 minutes' into v_count,v_reset from public.circle_theme_generation_requests where user_id=p_user and status='pending';
 if v_count>=1 then raise exception 'A wallpaper is already being generated' using errcode='P0001',detail=jsonb_build_object('kind','in_progress','retryAfter',greatest(1,ceil(extract(epoch from v_reset-v_now)))::integer,'resetAt',v_reset)::text; end if;
 select count(*),min(created_at)+interval '1 minute' into v_count,v_reset from public.circle_theme_generation_requests where user_id=p_user and created_at>v_now-interval '1 minute';
 if v_count>=p_burst_limit then raise exception 'Theme generation rate limit reached' using errcode='P0001',detail=jsonb_build_object('kind','burst','retryAfter',greatest(1,ceil(extract(epoch from v_reset-v_now)))::integer,'resetAt',v_reset,'limit',p_burst_limit)::text; end if;
 select count(*),min(created_at)+interval '24 hours' into v_count,v_reset from public.circle_theme_generation_requests where user_id=p_user and status='completed' and created_at>v_now-interval '24 hours';
 if v_count>=p_daily_limit then raise exception 'Theme generation daily limit reached' using errcode='P0001',detail=jsonb_build_object('kind','daily','retryAfter',greatest(1,ceil(extract(epoch from v_reset-v_now)))::integer,'resetAt',v_reset,'limit',p_daily_limit)::text; end if;
 insert into public.circle_theme_generation_requests(circle_id,user_id) values(p_circle,p_user) returning id into v_id;
 return v_id;
end;
$$;

create function public.fail_theme_wallpaper_generation(p_request uuid) returns void language sql security definer set search_path='' as $$
 update public.circle_theme_generation_requests set status='failed',finished_at=clock_timestamp() where id=p_request and status='pending';
$$;

create or replace function public.complete_theme_generation(p_request uuid,p_theme jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_request public.circle_theme_generation_requests;
begin
 select * into v_request from public.circle_theme_generation_requests where id=p_request for update;
 if not found then raise exception 'Theme request unavailable'; end if;
 -- A response can be lost after COMMIT. An exact service retry acknowledges the
 -- existing result; it neither writes again nor consumes another daily slot.
 if v_request.status='completed' and v_request.proposal=p_theme and p_theme->>'wallpaperPath'=v_request.circle_id::text||'/'||p_request::text||'.webp' and exists(select 1 from storage.objects where bucket_id='circle-wallpapers' and name=p_theme->>'wallpaperPath') then return; end if;
 if v_request.created_at<clock_timestamp()-interval '10 minutes' or v_request.proposal is not null or v_request.status<>'pending' then raise exception 'Theme request unavailable'; end if;
 if not exists(select 1 from public.circle_members where circle_id=v_request.circle_id and user_id=v_request.user_id and role in ('owner','admin')) then raise exception 'Manager access revoked' using errcode='42501'; end if;
 if not public.validate_circle_theme(p_theme) or p_theme->>'source'<>'ai' or p_theme->>'wallpaperPath' is distinct from v_request.circle_id::text||'/'||p_request::text||'.webp' then raise exception 'Invalid generated wallpaper theme' using errcode='23514'; end if;
 if not exists(select 1 from storage.objects where bucket_id='circle-wallpapers' and name=p_theme->>'wallpaperPath') then raise exception 'Generated wallpaper is missing' using errcode='23514'; end if;
 update public.circle_theme_generation_requests set proposal=p_theme,status='completed',finished_at=clock_timestamp() where id=p_request;
end;
$$;

-- Service-only confirmation distinguishes a lost HTTP response from an uncommitted
-- proposal without exposing other managers' prompts or allowing client polling.
create function public.is_theme_wallpaper_generation_complete(p_request uuid,p_theme jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.circle_theme_generation_requests r where r.id=p_request and r.status='completed' and r.proposal=p_theme and p_theme->>'wallpaperPath'=r.circle_id::text||'/'||r.id::text||'.webp' and exists(select 1 from storage.objects o where o.bucket_id='circle-wallpapers' and o.name=p_theme->>'wallpaperPath'));
$$;

create or replace function public.save_circle_theme(p_circle uuid,p_theme jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_circle_manager(p_circle) then raise exception 'Manager access required' using errcode='42501'; end if;
 if not public.validate_circle_theme(p_theme) then raise exception 'Invalid theme or insufficient color contrast' using errcode='23514'; end if;
 if p_theme ? 'wallpaperPath' and (split_part(p_theme->>'wallpaperPath','/',1)<>p_circle::text or not exists(select 1 from storage.objects where bucket_id='circle-wallpapers' and name=p_theme->>'wallpaperPath')) then raise exception 'Wallpaper unavailable for this Circle' using errcode='23514'; end if;
 if p_theme->>'source'='ai' and not exists(select 1 from public.circle_theme_generation_requests where circle_id=p_circle and user_id=auth.uid() and status='completed' and proposal=p_theme and created_at>clock_timestamp()-interval '1 day') and not exists(select 1 from public.circle_themes where circle_id=p_circle and theme=p_theme) then raise exception 'AI theme requires a server-generated proposal' using errcode='42501'; end if;
 insert into public.circle_themes(circle_id,theme,updated_by) values(p_circle,p_theme,auth.uid()) on conflict(circle_id) do update set theme=excluded.theme,updated_by=excluded.updated_by,updated_at=clock_timestamp();
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('circle-wallpapers','circle-wallpapers',false,10485760,array['image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function public.can_read_circle_wallpaper(p_path text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_circle uuid;
begin
 if p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$' then return false; end if;
 v_circle:=split_part(p_path,'/',1)::uuid;
 if not public.is_circle_member(v_circle) then return false; end if;
 return exists(select 1 from public.circle_themes where circle_id=v_circle and theme->>'wallpaperPath'=p_path)
  or (public.is_circle_manager(v_circle) and exists(select 1 from public.circle_theme_generation_requests where circle_id=v_circle and user_id=auth.uid() and status='completed' and created_at>clock_timestamp()-interval '1 day' and proposal->>'wallpaperPath'=p_path));
end;
$$;
create policy circle_wallpapers_read on storage.objects for select to authenticated using(bucket_id='circle-wallpapers' and public.can_read_circle_wallpaper(name));
-- No client INSERT/UPDATE/DELETE policy: only the Edge server can write images.
revoke all on function public.reserve_theme_generation(uuid) from authenticated;
revoke all on function public.reserve_theme_wallpaper_generation(uuid,uuid,integer,integer),public.fail_theme_wallpaper_generation(uuid),public.is_theme_wallpaper_generation_complete(uuid,jsonb),public.can_read_circle_wallpaper(text) from public,anon,authenticated;
grant execute on function public.reserve_theme_wallpaper_generation(uuid,uuid,integer,integer),public.fail_theme_wallpaper_generation(uuid),public.is_theme_wallpaper_generation_complete(uuid,jsonb) to service_role;
grant execute on function public.can_read_circle_wallpaper(text) to authenticated;
