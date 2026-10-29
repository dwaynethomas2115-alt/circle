-- Additive Circle community features. Apply after 202610270001_circle.sql.
create table public.circle_polls (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  question text not null check(length(trim(question)) between 3 and 240),
  closes_at timestamptz,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
create index circle_polls_feed on public.circle_polls(circle_id,created_at desc);
create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.circle_polls(id) on delete cascade,
  label text not null check(length(trim(label)) between 1 and 100),
  position smallint not null check(position between 0 and 5),
  unique(poll_id,id), unique(poll_id,position)
);
create table public.poll_votes (
  poll_id uuid not null references public.circle_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(poll_id,user_id),
  foreign key(poll_id,option_id) references public.poll_options(poll_id,id) on delete cascade
);
create table public.circle_events (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(trim(title)) between 3 and 120),
  description text not null default '' check(length(description)<=2000),
  location text not null default '' check(length(location)<=200),
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at>starts_at),
  created_at timestamptz not null default now()
);
create index circle_events_upcoming on public.circle_events(circle_id,starts_at);
create table public.event_rsvps (
  event_id uuid not null references public.circle_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check(response in ('going','maybe','not_going')),
  updated_at timestamptz not null default now(),
  primary key(event_id,user_id)
);
create table public.circle_read_states (
  circle_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null,
  primary key(circle_id,user_id),
  foreign key(circle_id,user_id) references public.circle_members(circle_id,user_id) on delete cascade
);
create table public.circle_themes (
  circle_id uuid primary key references public.circles(id) on delete cascade,
  theme jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- No client table grants on reservations/proposals; functions expose only a
-- caller-owned reservation ID or the applied theme, never other admins' prompts.
create table public.circle_theme_generation_requests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  proposal jsonb
);
create index circle_theme_generation_quota on public.circle_theme_generation_requests(user_id,created_at desc);

create function public.can_read_poll(p_poll uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.circle_polls where id=p_poll and public.is_circle_member(circle_id) and not public.is_blocked(author_id));
$$;
create function public.can_read_event(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.circle_events where id=p_event and public.is_circle_member(circle_id) and not public.is_blocked(author_id));
$$;
alter table public.circle_polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.circle_events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.circle_read_states enable row level security;
alter table public.circle_themes enable row level security;
alter table public.circle_theme_generation_requests enable row level security;
create policy polls_read on public.circle_polls for select to authenticated using(public.is_circle_member(circle_id) and not public.is_blocked(author_id));
create policy options_read on public.poll_options for select to authenticated using(public.can_read_poll(poll_id));
create policy votes_read on public.poll_votes for select to authenticated using(public.can_read_poll(poll_id) and not public.is_blocked(user_id));
create policy events_read on public.circle_events for select to authenticated using(public.is_circle_member(circle_id) and not public.is_blocked(author_id));
create policy rsvps_read on public.event_rsvps for select to authenticated using(public.can_read_event(event_id) and not public.is_blocked(user_id));
create policy read_states_read on public.circle_read_states for select to authenticated using(user_id=auth.uid() and public.is_circle_member(circle_id));
create policy themes_read on public.circle_themes for select to authenticated using(public.is_circle_member(circle_id));
revoke all on public.circle_polls,public.poll_options,public.poll_votes,public.circle_events,public.event_rsvps,public.circle_read_states,public.circle_themes,public.circle_theme_generation_requests from public,anon,authenticated;
grant select on public.circle_polls,public.poll_options,public.poll_votes,public.circle_events,public.event_rsvps,public.circle_read_states,public.circle_themes to authenticated;

create function public.create_poll(p_circle uuid,p_question text,p_options text[],p_closes_at timestamptz default null) returns public.circle_polls language plpgsql security definer set search_path='' as $$
declare v_poll public.circle_polls; v_count int;
begin
 if not public.is_circle_member(p_circle) then raise exception 'Membership required' using errcode='42501'; end if;
 if p_options is null or cardinality(p_options) not between 2 and 6 then raise exception 'Choose 2 to 6 distinct poll options'; end if;
 if exists(select 1 from unnest(p_options) x where x is null or length(trim(x)) not between 1 and 100) then raise exception 'Option length must be 1 to 100'; end if;
 select count(distinct lower(trim(x))) into v_count from unnest(p_options) x;
 if v_count<>cardinality(p_options) then raise exception 'Poll options must be distinct'; end if;
 if p_closes_at is not null and p_closes_at<=clock_timestamp() then raise exception 'Poll expiry must be in the future'; end if;
 insert into public.circle_polls(circle_id,author_id,question,closes_at) values(p_circle,auth.uid(),trim(p_question),p_closes_at) returning * into v_poll;
 insert into public.poll_options(poll_id,label,position) select v_poll.id,trim(option),(ordinality-1)::smallint from unnest(p_options) with ordinality as choices(option,ordinality);
 return v_poll;
end;
$$;
create function public.cast_poll_vote(p_poll uuid,p_option uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_poll public.circle_polls;
begin
 select * into v_poll from public.circle_polls where id=p_poll for update;
 if not found or not public.is_circle_member(v_poll.circle_id) or public.is_blocked(v_poll.author_id) then raise exception 'Poll unavailable' using errcode='42501'; end if;
 if v_poll.closed or (v_poll.closes_at is not null and v_poll.closes_at<=clock_timestamp()) then raise exception 'This poll has closed'; end if;
 if not exists(select 1 from public.poll_options where id=p_option and poll_id=p_poll) then raise exception 'Option does not belong to this poll' using errcode='23514'; end if;
 insert into public.poll_votes(poll_id,user_id,option_id) values(p_poll,auth.uid(),p_option) on conflict(poll_id,user_id) do update set option_id=excluded.option_id,created_at=clock_timestamp();
end;
$$;
create function public.close_poll(p_poll uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_poll public.circle_polls;
begin
 select * into v_poll from public.circle_polls where id=p_poll for update;
 if not found or not public.is_circle_member(v_poll.circle_id) or (v_poll.author_id<>auth.uid() and not public.is_circle_manager(v_poll.circle_id)) then raise exception 'Poll management not permitted' using errcode='42501'; end if;
 update public.circle_polls set closed=true where id=p_poll;
end;
$$;
create function public.delete_poll(p_poll uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_poll public.circle_polls;
begin
 select * into v_poll from public.circle_polls where id=p_poll for update;
 if not found or not public.is_circle_member(v_poll.circle_id) or (v_poll.author_id<>auth.uid() and not public.is_circle_manager(v_poll.circle_id)) then raise exception 'Poll management not permitted' using errcode='42501'; end if;
 delete from public.circle_polls where id=p_poll;
end;
$$;
create function public.create_event(p_circle uuid,p_title text,p_description text,p_location text,p_starts_at timestamptz,p_ends_at timestamptz) returns public.circle_events language plpgsql security definer set search_path='' as $$
declare v_event public.circle_events;
begin
 if not public.is_circle_member(p_circle) then raise exception 'Membership required' using errcode='42501'; end if;
 if p_starts_at<=clock_timestamp() then raise exception 'Event start must be in the future'; end if;
 insert into public.circle_events(circle_id,author_id,title,description,location,starts_at,ends_at) values(p_circle,auth.uid(),trim(p_title),p_description,p_location,p_starts_at,p_ends_at) returning * into v_event;
 return v_event;
end;
$$;
create function public.delete_event(p_event uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_event public.circle_events;
begin
 select * into v_event from public.circle_events where id=p_event for update;
 if not found or not public.is_circle_member(v_event.circle_id) or (v_event.author_id<>auth.uid() and not public.is_circle_manager(v_event.circle_id)) then raise exception 'Event management not permitted' using errcode='42501'; end if;
 delete from public.circle_events where id=p_event;
end;
$$;
create function public.set_event_rsvp(p_event uuid,p_response text) returns void language plpgsql security definer set search_path='' as $$
declare v_event public.circle_events;
begin
 select * into v_event from public.circle_events where id=p_event for update;
 if not found or not public.is_circle_member(v_event.circle_id) or public.is_blocked(v_event.author_id) then raise exception 'Event unavailable' using errcode='42501'; end if;
 if v_event.ends_at<=clock_timestamp() then raise exception 'This event has ended'; end if;
 insert into public.event_rsvps(event_id,user_id,response) values(p_event,auth.uid(),p_response) on conflict(event_id,user_id) do update set response=excluded.response,updated_at=clock_timestamp();
end;
$$;
create function public.mark_circle_caught_up(p_circle uuid,p_seen_at timestamptz default clock_timestamp()) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_circle_member(p_circle) then raise exception 'Membership required' using errcode='42501'; end if;
 if p_seen_at is null or p_seen_at>clock_timestamp() then raise exception 'Read cutoff cannot be in the future'; end if;
 insert into public.circle_read_states(circle_id,user_id,seen_at) values(p_circle,auth.uid(),p_seen_at) on conflict(circle_id,user_id) do update set seen_at=greatest(public.circle_read_states.seen_at,excluded.seen_at);
end;
$$;

-- Theme JSON is data, never HTML/CSS/URLs. Palette checks are enforced in SQL as
-- well as in the AI handler. All allowed text remains ordinary rendered text.
create function public.theme_luminance(p_hex text) returns numeric language plpgsql immutable set search_path='' as $$
declare v_bytes bytea; v_channels numeric[]='{}'; v_channel numeric; i int;
begin
 if p_hex !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid theme color'; end if;
 v_bytes:=decode(substr(p_hex,2),'hex');
 for i in 0..2 loop
  v_channel:=get_byte(v_bytes,i)::numeric/255;
  v_channels:=array_append(v_channels,case when v_channel<=0.04045 then v_channel/12.92 else power((v_channel+0.055)/1.055,2.4) end);
 end loop;
 return 0.2126*v_channels[1]+0.7152*v_channels[2]+0.0722*v_channels[3];
end;
$$;
create function public.theme_contrast(p_a text,p_b text) returns numeric language sql immutable set search_path='' as $$
 select (greatest(public.theme_luminance(p_a),public.theme_luminance(p_b))+0.05)/(least(public.theme_luminance(p_a),public.theme_luminance(p_b))+0.05);
$$;
create function public.validate_circle_theme(p_theme jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare v_key text;
begin
 if p_theme is null or jsonb_typeof(p_theme)<>'object' or (select count(*) from jsonb_object_keys(p_theme))<>9 then return false; end if;
 for v_key in select jsonb_object_keys(p_theme) loop
  if v_key not in ('id','label','prompt','accent','background','surface','ink','motif','source') or jsonb_typeof(p_theme->v_key)<>'string' then return false; end if;
 end loop;
 if p_theme->>'id' !~ '^[a-zA-Z0-9_-]{1,80}$' or length(trim(p_theme->>'label')) not between 3 and 60 or length(p_theme->>'prompt')>300 then return false; end if;
 if p_theme->>'motif' not in ('garden','unicorn','vegas','coast','minimal') or p_theme->>'source' not in ('preset','ai') then return false; end if;
 return public.theme_luminance(p_theme->>'background')>=0.8 and public.theme_luminance(p_theme->>'surface')>=0.85 and public.theme_contrast(p_theme->>'ink',p_theme->>'surface')>=4.5 and public.theme_contrast(p_theme->>'ink',p_theme->>'background')>=4.5 and public.theme_contrast('#FFFFFF',p_theme->>'accent')>=4.5;
exception when others then return false;
end;
$$;
create function public.reserve_theme_generation(p_circle uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_circle_manager(p_circle) then raise exception 'Manager access required' using errcode='42501'; end if;
 -- Locks serialize same-user and same-Circle quota checks across requests.
 perform pg_advisory_xact_lock(hashtextextended('theme-user:'||auth.uid()::text,0));
 perform pg_advisory_xact_lock(hashtextextended('theme-circle:'||p_circle::text,0));
 if (select count(*) from public.circle_theme_generation_requests where user_id=auth.uid() and circle_id=p_circle and created_at>clock_timestamp()-interval '1 hour')>=5
  or (select count(*) from public.circle_theme_generation_requests where user_id=auth.uid() and created_at>clock_timestamp()-interval '1 day')>=20
  or (select count(*) from public.circle_theme_generation_requests where circle_id=p_circle and created_at>clock_timestamp()-interval '1 hour')>=12 then
  raise exception 'Theme generation rate limit reached. Try again later' using errcode='P0001';
 end if;
 insert into public.circle_theme_generation_requests(circle_id,user_id) values(p_circle,auth.uid()) returning id into v_id;
 return v_id;
end;
$$;
create function public.complete_theme_generation(p_request uuid,p_theme jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_request public.circle_theme_generation_requests;
begin
 select * into v_request from public.circle_theme_generation_requests where id=p_request for update;
 if not found or v_request.created_at<clock_timestamp()-interval '10 minutes' or v_request.proposal is not null then raise exception 'Theme request unavailable'; end if;
 if not exists(select 1 from public.circle_members where circle_id=v_request.circle_id and user_id=v_request.user_id and role in ('owner','admin')) then raise exception 'Manager access revoked' using errcode='42501'; end if;
 if not public.validate_circle_theme(p_theme) or p_theme->>'source'<>'ai' then raise exception 'Invalid generated theme' using errcode='23514'; end if;
 update public.circle_theme_generation_requests set proposal=p_theme where id=p_request;
end;
$$;
create function public.save_circle_theme(p_circle uuid,p_theme jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_circle_manager(p_circle) then raise exception 'Manager access required' using errcode='42501'; end if;
 if not public.validate_circle_theme(p_theme) then raise exception 'Invalid theme or insufficient color contrast' using errcode='23514'; end if;
 if p_theme->>'source'='ai' and not exists(select 1 from public.circle_theme_generation_requests where circle_id=p_circle and user_id=auth.uid() and proposal=p_theme and created_at>clock_timestamp()-interval '1 day') and not exists(select 1 from public.circle_themes where circle_id=p_circle and theme=p_theme) then
  raise exception 'AI theme requires a server-generated proposal' using errcode='42501';
 end if;
 insert into public.circle_themes(circle_id,theme,updated_by) values(p_circle,p_theme,auth.uid()) on conflict(circle_id) do update set theme=excluded.theme,updated_by=excluded.updated_by,updated_at=clock_timestamp();
end;
$$;

create function public.notify_circle_feature() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(user_id,actor_id,circle_id,kind,title)
  select m.user_id,new.author_id,new.circle_id,'post',case tg_table_name when 'circle_polls' then 'A new poll in your Circle' else 'A new event in your Circle' end
  from public.circle_members m where m.circle_id=new.circle_id and m.user_id<>new.author_id
  and not exists(select 1 from public.user_blocks b where (b.blocker_id=m.user_id and b.blocked_id=new.author_id) or (b.blocked_id=m.user_id and b.blocker_id=new.author_id));
 return new;
end;
$$;
create trigger poll_activity after insert on public.circle_polls for each row execute function public.notify_circle_feature();
create trigger event_activity after insert on public.circle_events for each row execute function public.notify_circle_feature();

-- A durable provider-revocation outbox. Delivery uses the documented service-only
-- Edge hook and retry job, never a caller-provided target identity.
create table public.circle_call_revocations (
 id uuid primary key default gen_random_uuid(),
 circle_id uuid not null,
 user_id uuid not null,
 created_at timestamptz not null default now(),
 delivered_at timestamptz
);
create index circle_call_revocations_pending on public.circle_call_revocations(created_at) where delivered_at is null;
alter table public.circle_call_revocations enable row level security;
revoke all on public.circle_call_revocations from public,anon,authenticated;
create function public.enqueue_circle_call_revocation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.circle_call_revocations(circle_id,user_id) values(old.circle_id,old.user_id);
 return old;
end;
$$;
create trigger membership_call_revocation after delete on public.circle_members for each row execute function public.enqueue_circle_call_revocation();
create function public.pending_circle_call_revocations() returns table(id uuid,circle_id uuid,user_id uuid) language sql security definer set search_path='' as $$
 select id,circle_id,user_id from public.circle_call_revocations where delivered_at is null order by created_at limit 100;
$$;
create function public.ack_circle_call_revocation(p_id uuid) returns void language sql security definer set search_path='' as $$
 update public.circle_call_revocations set delivered_at=clock_timestamp() where id=p_id and delivered_at is null;
$$;

revoke all on function public.can_read_poll(uuid),public.can_read_event(uuid),public.create_poll(uuid,text,text[],timestamptz),public.cast_poll_vote(uuid,uuid),public.close_poll(uuid),public.delete_poll(uuid),public.create_event(uuid,text,text,text,timestamptz,timestamptz),public.delete_event(uuid),public.set_event_rsvp(uuid,text),public.mark_circle_caught_up(uuid,timestamptz),public.theme_luminance(text),public.theme_contrast(text,text),public.validate_circle_theme(jsonb),public.reserve_theme_generation(uuid),public.complete_theme_generation(uuid,jsonb),public.save_circle_theme(uuid,jsonb),public.notify_circle_feature(),public.enqueue_circle_call_revocation(),public.pending_circle_call_revocations(),public.ack_circle_call_revocation(uuid) from public,anon,authenticated;
grant execute on function public.can_read_poll(uuid),public.can_read_event(uuid),public.create_poll(uuid,text,text[],timestamptz),public.cast_poll_vote(uuid,uuid),public.close_poll(uuid),public.delete_poll(uuid),public.create_event(uuid,text,text,text,timestamptz,timestamptz),public.delete_event(uuid),public.set_event_rsvp(uuid,text),public.mark_circle_caught_up(uuid,timestamptz),public.save_circle_theme(uuid,jsonb),public.reserve_theme_generation(uuid) to authenticated;
grant execute on function public.complete_theme_generation(uuid,jsonb),public.pending_circle_call_revocations(),public.ack_circle_call_revocation(uuid) to service_role;

do $$ declare v_table text; begin
 foreach v_table in array array['circle_polls','poll_options','poll_votes','circle_events','event_rsvps','circle_themes'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
   execute format('alter publication supabase_realtime add table public.%I',v_table);
  end if;
 end loop;
end $$;
