-- Circle: private by default. Run in a fresh Supabase project as postgres.
create extension if not exists pgcrypto with schema extensions;

create type public.circle_role as enum ('owner', 'admin', 'moderator', 'member');
create type public.circle_category as enum ('Family', 'Friends', 'School', 'Community', 'Hobby', 'Other');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  avatar_url text,
  bio text not null default '' check (length(bio) <= 300),
  adult_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  description text not null default '' check (length(description) <= 1000),
  category public.circle_category not null default 'Other',
  discoverable boolean not null default false,
  approval_required boolean not null default true,
  avatar_url text,
  cover_url text,
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.circle_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index circle_members_user_idx on public.circle_members(user_id, circle_id);
create unique index circle_one_owner on public.circle_members(circle_id) where role = 'owner';
create table public.circle_join_requests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique (circle_id, user_id)
);
create table public.circle_invitations (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  email text,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body text not null default '' check (length(body) <= 10000),
  created_at timestamptz not null default now()
);
create index posts_feed_idx on public.posts(circle_id, created_at desc);
create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image','video')),
  created_at timestamptz not null default now()
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments(post_id, created_at);
create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  reaction text not null default 'heart' check (reaction in ('heart','celebrate','support')),
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);
create table public.circle_messages (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index circle_messages_feed_idx on public.circle_messages(circle_id, created_at desc);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  kind text not null check (kind in ('request','approval','invitation','comment','reply','reaction','post')),
  title text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id,created_at desc);
create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (blocker_id <> blocked_id),
  primary key (blocker_id,blocked_id)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  post_id uuid references public.posts(id) on delete cascade,
  message_id uuid references public.circle_messages(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (num_nonnulls(post_id,message_id,comment_id) = 1)
);

-- Definer helpers avoid recursive membership policies. No caller-controlled user argument.
create function public.is_circle_member(p_circle uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.circle_members where circle_id = p_circle and user_id = auth.uid());
$$;
create function public.circle_role_for(p_circle uuid) returns public.circle_role language sql stable security definer set search_path = '' as $$
  select role from public.circle_members where circle_id = p_circle and user_id = auth.uid();
$$;
create function public.is_circle_manager(p_circle uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.circle_role_for(p_circle) in ('owner','admin'),false);
$$;
create function public.is_circle_moderator(p_circle uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.circle_role_for(p_circle) in ('owner','admin','moderator'),false);
$$;
create function public.is_blocked(p_other uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_blocks where (blocker_id = auth.uid() and blocked_id = p_other) or (blocked_id = auth.uid() and blocker_id = p_other));
$$;
create function public.can_read_post(p_post uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.posts where id = p_post and public.is_circle_member(circle_id) and not public.is_blocked(author_id));
$$;
create function public.can_manage_post(p_post uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.posts where id = p_post and public.is_circle_member(circle_id) and (author_id = auth.uid() or public.is_circle_moderator(circle_id)));
$$;

alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_join_requests enable row level security;
alter table public.circle_invitations enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.circle_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;

-- Profile contains intentionally non-sensitive identity only. Email stays in auth.users.
create policy profiles_read on public.profiles for select to authenticated using (not public.is_blocked(id));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy circles_read on public.circles for select to authenticated using (discoverable or public.is_circle_member(id));
create policy circles_update on public.circles for update to authenticated using (public.is_circle_manager(id)) with check (public.is_circle_manager(id));
create policy members_read on public.circle_members for select to authenticated using (public.is_circle_member(circle_id));
create policy requests_read on public.circle_join_requests for select to authenticated using (user_id = auth.uid() or public.is_circle_manager(circle_id));
create policy invitations_read on public.circle_invitations for select to authenticated using (public.is_circle_manager(circle_id));
create policy posts_read on public.posts for select to authenticated using (public.is_circle_member(circle_id) and not public.is_blocked(author_id));
create policy posts_insert on public.posts for insert to authenticated with check (author_id = auth.uid() and public.is_circle_member(circle_id));
create policy posts_delete on public.posts for delete to authenticated using (public.is_circle_member(circle_id) and (author_id = auth.uid() or public.is_circle_moderator(circle_id)));
create policy media_read on public.post_media for select to authenticated using (public.can_read_post(post_id));
create policy media_insert on public.post_media for insert to authenticated with check (
  exists(select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid() and public.is_circle_member(p.circle_id)
    and split_part(storage_path,'/',1) = p.circle_id::text and split_part(storage_path,'/',2) = auth.uid()::text)
);
create policy media_delete on public.post_media for delete to authenticated using (public.can_manage_post(post_id));
create policy comments_read on public.comments for select to authenticated using (public.can_read_post(post_id) and not public.is_blocked(author_id));
create policy comments_insert on public.comments for insert to authenticated with check (author_id = auth.uid() and public.can_read_post(post_id));
create policy comments_delete on public.comments for delete to authenticated using ((author_id = auth.uid() and public.can_read_post(post_id)) or exists(select 1 from public.posts p where p.id=post_id and public.is_circle_moderator(p.circle_id)));
create policy reactions_read on public.post_reactions for select to authenticated using (public.can_read_post(post_id) and not public.is_blocked(user_id));
create policy reactions_insert on public.post_reactions for insert to authenticated with check (user_id = auth.uid() and public.can_read_post(post_id));
create policy reactions_delete on public.post_reactions for delete to authenticated using (user_id = auth.uid() and public.can_read_post(post_id));
create policy messages_read on public.circle_messages for select to authenticated using (public.is_circle_member(circle_id) and not public.is_blocked(author_id));
create policy messages_insert on public.circle_messages for insert to authenticated with check (author_id = auth.uid() and public.is_circle_member(circle_id));
create policy messages_delete on public.circle_messages for delete to authenticated using (public.is_circle_member(circle_id) and (author_id = auth.uid() or public.is_circle_moderator(circle_id)));
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy blocks_read on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert on public.user_blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());
create policy reports_read on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_circle_moderator(circle_id));
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid() and public.is_circle_member(circle_id));

-- Column grants make immutable foreign keys/owner IDs immutable, even for admins.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles,public.circles,public.circle_members,public.circle_join_requests,public.circle_invitations,public.posts,public.post_media,public.comments,public.post_reactions,public.circle_messages,public.notifications,public.user_blocks,public.reports to authenticated;
grant update(name,username,avatar_url,bio) on public.profiles to authenticated;
grant update(name,description,category,discoverable,approval_required,avatar_url,cover_url) on public.circles to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant insert,delete on public.posts,public.post_media,public.comments,public.post_reactions,public.circle_messages,public.user_blocks to authenticated;
grant insert on public.reports to authenticated;

-- Enforce cross-row invariants independently from visibility/RLS.
create function public.check_content_links() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'comments' then
    if new.parent_id is not null then
      if not exists(select 1 from public.comments where id = new.parent_id and post_id = new.post_id) then
        raise exception 'Reply must belong to the same post' using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'reports' then
    if new.post_id is not null and not exists(select 1 from public.posts where id = new.post_id and circle_id = new.circle_id) then
      raise exception 'Reported post must belong to the Circle' using errcode = '23514';
    end if;
    if new.message_id is not null and not exists(select 1 from public.circle_messages where id = new.message_id and circle_id = new.circle_id) then
      raise exception 'Reported message must belong to the Circle' using errcode = '23514';
    end if;
    if new.comment_id is not null and not exists(select 1 from public.comments c join public.posts p on p.id=c.post_id where c.id=new.comment_id and p.circle_id=new.circle_id) then
      raise exception 'Reported comment must belong to the Circle' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger comments_link_check before insert or update on public.comments for each row execute function public.check_content_links();
create trigger reports_link_check before insert or update on public.reports for each row execute function public.check_content_links();

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text; v_username text;
begin
  if new.raw_user_meta_data->>'adult_confirmed' is distinct from 'true' then
    raise exception 'Adult account attestation is required' using errcode='23514';
  end if;
  v_name := left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Circle member'),80);
  v_username := lower(coalesce(new.raw_user_meta_data->>'username',''));
  if v_username !~ '^[a-z0-9_]{3,30}$' then v_username := 'member_' || replace(new.id::text,'-',''); v_username := left(v_username,30); end if;
  -- Keep auth signup atomic; duplicate usernames are rejected instead of stolen.
  insert into public.profiles(id,name,username) values(new.id,v_name,v_username);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.create_circle(p_name text,p_description text default '',p_category public.circle_category default 'Other',p_discoverable boolean default false,p_approval_required boolean default true,p_avatar_url text default null,p_cover_url text default null) returns public.circles language plpgsql security definer set search_path = '' as $$
declare v_circle public.circles;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into public.circles(name,description,category,discoverable,approval_required,avatar_url,cover_url,owner_id)
    values(trim(p_name),p_description,p_category,p_discoverable,p_approval_required,p_avatar_url,p_cover_url,auth.uid()) returning * into v_circle;
  insert into public.circle_members(circle_id,user_id,role) values(v_circle.id,auth.uid(),'owner');
  return v_circle;
end;
$$;
create function public.request_join(p_circle uuid) returns public.circle_join_requests language plpgsql security definer set search_path = '' as $$
declare v_circle public.circles; v_request public.circle_join_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_circle from public.circles where id=p_circle and discoverable for update;
  if not found then raise exception 'Circle unavailable' using errcode='42501'; end if;
  if public.is_circle_member(p_circle) then raise exception 'Already a member'; end if;
  insert into public.circle_join_requests(circle_id,user_id,status) values(p_circle,auth.uid(),case when v_circle.approval_required then 'pending' else 'approved' end)
    on conflict(circle_id,user_id) do update set status=excluded.status,created_at=now() returning * into v_request;
  if not v_circle.approval_required then insert into public.circle_members(circle_id,user_id) values(p_circle,auth.uid()) on conflict do nothing; end if;
  return v_request;
end;
$$;
create function public.review_join_request(p_request uuid,p_approve boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.circle_join_requests;
begin
  select * into v_request from public.circle_join_requests where id=p_request for update;
  if not found or not public.is_circle_manager(v_request.circle_id) then raise exception 'Manager access required' using errcode='42501'; end if;
  if v_request.status <> 'pending' then raise exception 'Request already reviewed'; end if;
  update public.circle_join_requests set status=case when p_approve then 'approved' else 'rejected' end where id=p_request;
  if p_approve then
    insert into public.circle_members(circle_id,user_id) values(v_request.circle_id,v_request.user_id) on conflict do nothing;
    insert into public.notifications(user_id,actor_id,circle_id,kind,title) values(v_request.user_id,auth.uid(),v_request.circle_id,'approval','Your Circle request was approved');
  end if;
end;
$$;
create function public.create_invitation(p_circle uuid,p_email text default null) returns text language plpgsql security definer set search_path = '' as $$
declare v_token text; v_user uuid;
begin
  if not public.is_circle_manager(p_circle) then raise exception 'Manager access required' using errcode='42501'; end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.circle_invitations(circle_id,invited_by,email,token_hash) values(p_circle,auth.uid(),nullif(lower(trim(p_email)),''),encode(extensions.digest(v_token,'sha256'),'hex'));
  if p_email is not null then
    select id into v_user from auth.users where lower(email)=lower(trim(p_email));
    if v_user is not null then insert into public.notifications(user_id,actor_id,circle_id,kind,title) values(v_user,auth.uid(),p_circle,'invitation','You have a private Circle invitation'); end if;
  end if;
  return v_token;
end;
$$;
create function public.accept_invitation(p_token text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_invite public.circle_invitations; v_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_invite from public.circle_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or v_invite.expires_at <= now() or v_invite.redeemed_at is not null then raise exception 'Invitation invalid or expired' using errcode='42501'; end if;
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_invite.email is not null and (v_email is null or v_email <> v_invite.email) then raise exception 'Invitation requires its verified email address' using errcode='42501'; end if;
  insert into public.circle_members(circle_id,user_id) values(v_invite.circle_id,auth.uid()) on conflict do nothing;
  update public.circle_invitations set redeemed_by=auth.uid(),redeemed_at=now() where id=v_invite.id;
  return v_invite.circle_id;
end;
$$;
create function public.change_member_role(p_circle uuid,p_user uuid,p_role public.circle_role) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor public.circle_role; v_target public.circle_role;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from public.circles where id=p_circle for update;
  v_actor := public.circle_role_for(p_circle);
  if v_actor is null or v_actor not in ('owner','admin') then raise exception 'Role change not permitted' using errcode='42501'; end if;
  select role into v_target from public.circle_members where circle_id=p_circle and user_id=p_user;
  if v_target is null then raise exception 'Member not found'; end if;
  if v_target='owner' or p_role='owner' or v_actor is null or v_actor not in ('owner','admin') or (v_actor='admin' and (v_target='admin' or p_role='admin')) then raise exception 'Role change not permitted' using errcode='42501'; end if;
  update public.circle_members set role=p_role where circle_id=p_circle and user_id=p_user;
end;
$$;
create function public.remove_circle_member(p_circle uuid,p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor public.circle_role; v_target public.circle_role;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from public.circles where id=p_circle for update;
  v_actor := public.circle_role_for(p_circle);
  if v_actor is null or (p_user<>auth.uid() and v_actor not in ('owner','admin')) then raise exception 'Removal not permitted' using errcode='42501'; end if;
  select role into v_target from public.circle_members where circle_id=p_circle and user_id=p_user;
  if v_target is null then raise exception 'Member not found'; end if;
  if v_target='owner' then raise exception 'Transfer ownership or delete the Circle before leaving' using errcode='42501'; end if;
  if p_user<>auth.uid() and (v_actor is null or v_actor not in ('owner','admin') or (v_actor='admin' and v_target='admin')) then raise exception 'Removal not permitted' using errcode='42501'; end if;
  delete from public.circle_members where circle_id=p_circle and user_id=p_user;
  -- Old previews/invitations must not retain private content or restore removed access.
  delete from public.notifications where circle_id=p_circle and user_id=p_user;
  -- Invalidate outstanding bearer invitations too: a removed user may hold one.
  update public.circle_invitations set expires_at=least(expires_at,now()) where circle_id=p_circle;
end;
$$;
create function public.transfer_circle_ownership(p_circle uuid,p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.circles where id=p_circle for update;
  if public.circle_role_for(p_circle) is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_user=auth.uid() or not exists(select 1 from public.circle_members where circle_id=p_circle and user_id=p_user) then raise exception 'Choose another existing member'; end if;
  update public.circle_members set role='admin' where circle_id=p_circle and user_id=auth.uid();
  update public.circle_members set role='owner' where circle_id=p_circle and user_id=p_user;
  update public.circles set owner_id=p_user where id=p_circle;
end;
$$;
create function public.delete_circle(p_circle uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.circle_role_for(p_circle) is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  delete from public.circles where id=p_circle;
end;
$$;
create function public.delete_account() returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Physical storage removal is performed through the Storage API before this RPC.
  -- Refuse deletion if cleanup was skipped or raced with another upload.
  if exists(select 1 from storage.objects where (bucket_id='circle-media' and split_part(name,'/',2)=auth.uid()::text) or (bucket_id='profile-avatars' and split_part(name,'/',1)=auth.uid()::text)) then
    raise exception 'Remove your uploaded storage objects before deleting the account';
  end if;
  -- Caller must be informed that owned Circles are deleted with their account.
  delete from public.circles where owner_id=auth.uid();
  delete from auth.users where id=auth.uid();
end;
$$;

create function public.notify_activity() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_post public.posts; v_parent public.comments; v_recipient uuid; v_kind text;
begin
  if tg_table_name='posts' then
    insert into public.notifications(user_id,actor_id,circle_id,post_id,kind,title)
      select m.user_id,new.author_id,new.circle_id,new.id,'post','A new post in your Circle' from public.circle_members m
      where m.circle_id=new.circle_id and m.user_id<>new.author_id and not exists(select 1 from public.user_blocks b where (b.blocker_id=m.user_id and b.blocked_id=new.author_id) or (b.blocked_id=m.user_id and b.blocker_id=new.author_id));
  elsif tg_table_name in ('comments','post_reactions') then
    select * into v_post from public.posts where id=new.post_id;
    v_recipient := v_post.author_id;
    v_kind := case when tg_table_name='comments' then 'comment' else 'reaction' end;
    if tg_table_name='comments' then
      if new.parent_id is not null then select * into v_parent from public.comments where id=new.parent_id; v_recipient := v_parent.author_id; v_kind:='reply'; end if;
    end if;
    if v_recipient<>auth.uid() and exists(select 1 from public.circle_members where circle_id=v_post.circle_id and user_id=v_recipient) and not public.is_blocked(v_recipient) then
      insert into public.notifications(user_id,actor_id,circle_id,post_id,kind,title) values(v_recipient,auth.uid(),v_post.circle_id,v_post.id,v_kind,case v_kind when 'comment' then 'Someone commented on your post' when 'reply' then 'Someone replied to your comment' else 'Someone reacted to your post' end);
    end if;
  elsif tg_table_name='circle_join_requests' and new.status='pending' then
    insert into public.notifications(user_id,actor_id,circle_id,kind,title) select user_id,new.user_id,new.circle_id,'request','A membership request needs review' from public.circle_members where circle_id=new.circle_id and role in ('owner','admin');
  end if;
  return new;
end;
$$;
create trigger posts_notify after insert on public.posts for each row execute function public.notify_activity();
create trigger comments_notify after insert on public.comments for each row execute function public.notify_activity();
create trigger reactions_notify after insert on public.post_reactions for each row execute function public.notify_activity();
create trigger requests_notify after insert or update on public.circle_join_requests for each row execute function public.notify_activity();

-- Private media: original objects never have public URLs. Sign URLs for at most 60s.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('circle-media','circle-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function public.can_read_media(p_path text) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_circle uuid; v_author uuid;
begin
  begin v_circle := split_part(p_path,'/',1)::uuid; v_author := split_part(p_path,'/',2)::uuid; exception when invalid_text_representation then return false; end;
  return public.is_circle_member(v_circle) and not public.is_blocked(v_author) and exists(select 1 from public.profiles where id=v_author) and (
    exists(select 1 from public.post_media m join public.posts p on p.id=m.post_id where m.storage_path=p_path and p.circle_id=v_circle)
    or exists(select 1 from public.circles where id=v_circle and (avatar_url=p_path or cover_url=p_path))
    or exists(select 1 from public.profiles where id=v_author and avatar_url=p_path)
  );
end;
$$;
create function public.can_upload_media(p_path text) returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return split_part(p_path,'/',2)=auth.uid()::text and public.is_circle_member(split_part(p_path,'/',1)::uuid) and array_length(string_to_array(p_path,'/'),1)=3;
exception when invalid_text_representation then return false;
end;
$$;
create policy circle_media_read on storage.objects for select to authenticated using (bucket_id='circle-media' and public.can_read_media(name));
create policy circle_media_insert on storage.objects for insert to authenticated with check (bucket_id='circle-media' and public.can_upload_media(name));
create policy circle_media_delete on storage.objects for delete to authenticated using (bucket_id='circle-media' and split_part(name,'/',2)=auth.uid()::text);

-- Every definer function is explicitly scoped to signed-in callers. Trigger functions
-- cannot be directly executed by users. Public/anon never get RPC access.
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_circle_member(uuid),public.circle_role_for(uuid),public.is_circle_manager(uuid),public.is_circle_moderator(uuid),public.is_blocked(uuid),public.can_read_post(uuid),public.can_manage_post(uuid),public.can_read_media(text),public.can_upload_media(text) to authenticated;
grant execute on function public.create_circle(text,text,public.circle_category,boolean,boolean,text,text),public.request_join(uuid),public.review_join_request(uuid,boolean),public.create_invitation(uuid,text),public.accept_invitation(text),public.change_member_role(uuid,uuid,public.circle_role),public.remove_circle_member(uuid,uuid),public.transfer_circle_ownership(uuid,uuid),public.delete_circle(uuid),public.delete_account() to authenticated;

-- Supabase Postgres Changes checks SELECT RLS on each new event. Refetch after each
-- event and on app focus/token refresh. Do not use public broadcast channels.
do $$ begin
  alter publication supabase_realtime add table public.circle_messages;
  alter publication supabase_realtime add table public.posts;
  alter publication supabase_realtime add table public.comments;
  alter publication supabase_realtime add table public.post_reactions;
  alter publication supabase_realtime add table public.notifications;
  alter publication supabase_realtime add table public.circle_members;
exception when duplicate_object then null;
end $$;

-- Atomic post creation keeps media attachment and notification state consistent.
create function public.create_post(p_circle uuid,p_body text,p_media jsonb default '[]'::jsonb) returns public.posts language plpgsql security definer set search_path = '' as $$
declare v_post public.posts; v_media jsonb;
begin
  if not public.is_circle_member(p_circle) then raise exception 'Membership required' using errcode='42501'; end if;
  if jsonb_typeof(p_media) <> 'array' or jsonb_array_length(p_media)>4 then raise exception 'At most four attachments allowed'; end if;
  if length(trim(p_body))=0 and jsonb_array_length(p_media)=0 then raise exception 'Post cannot be empty'; end if;
  for v_media in select * from jsonb_array_elements(p_media) loop
    if split_part(v_media->>'storage_path','/',1) is distinct from p_circle::text or split_part(v_media->>'storage_path','/',2) is distinct from auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='circle-media' and name=v_media->>'storage_path') then
      raise exception 'Attachment is not an uploaded object owned by this member' using errcode='42501';
    end if;
  end loop;
  insert into public.posts(circle_id,author_id,body) values(p_circle,auth.uid(),trim(p_body)) returning * into v_post;
  insert into public.post_media(post_id,storage_path,media_type) select v_post.id,value->>'storage_path',value->>'media_type' from jsonb_array_elements(p_media);
  return v_post;
end;
$$;
revoke all on function public.create_post(uuid,text,jsonb) from public,anon;
grant execute on function public.create_post(uuid,text,jsonb) to authenticated;

-- Profile pictures are deliberately visible to authenticated accounts, but not
-- public/anonymous Internet visitors. Original uploads are always re-encoded.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-avatars','profile-avatars',false,5242880,array['image/jpeg']) on conflict(id) do update set public=false;
create function public.can_read_avatar(p_path text) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid;
begin
  begin v_user := split_part(p_path,'/',1)::uuid; exception when invalid_text_representation then return false; end;
  return not public.is_blocked(v_user) and exists(select 1 from public.profiles where id=v_user and avatar_url=p_path);
end;
$$;
revoke all on function public.can_read_avatar(text) from public,anon;
grant execute on function public.can_read_avatar(text) to authenticated;
create policy profile_avatar_read on storage.objects for select to authenticated using (bucket_id='profile-avatars' and public.can_read_avatar(name));
create policy profile_avatar_insert on storage.objects for insert to authenticated with check (bucket_id='profile-avatars' and split_part(name,'/',1)=auth.uid()::text);
create policy profile_avatar_delete on storage.objects for delete to authenticated using (bucket_id='profile-avatars' and split_part(name,'/',1)=auth.uid()::text);

-- Listing exposes only the caller's object paths, allowing Storage API cleanup
-- even after Circle membership has been revoked, without granting blob reads.
create function public.owned_media_paths() returns table(bucket_id text,name text) language sql stable security definer set search_path = '' as $$
  select o.bucket_id,o.name from storage.objects o
  where auth.uid() is not null and ((o.bucket_id='circle-media' and split_part(o.name,'/',2)=auth.uid()::text) or (o.bucket_id='profile-avatars' and split_part(o.name,'/',1)=auth.uid()::text));
$$;
revoke all on function public.owned_media_paths() from public,anon;
grant execute on function public.owned_media_paths() to authenticated;
