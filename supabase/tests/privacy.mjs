/**
 * Runs the exact migration in embedded PostgreSQL (PGlite), with minimal auth
 * JWT and storage-schema fixtures. Exercises real SQL/RLS as non-superuser roles.
 * Hosted Auth, storage signing/download, and Realtime need separate integration
 * checks against the configured Supabase project; this suite does not fake those.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const ids = Object.fromEntries(['owner', 'member', 'outsider', 'admin', 'other', 'invitee'].map((name, i) => [name, `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`]));
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

test('Circle migration and private membership boundaries', async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;
    create publication supabase_realtime;
  `);
  await db.exec(await readFile(new URL('../migrations/202610270001_circle.sql', import.meta.url), 'utf8'));
  const scalar = async (sql) => (await db.query(sql)).rows[0]?.value;
  const as = async (who) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub',${q(ids[who] ?? '')},false); set role ${who === 'anon' ? 'anon' : 'authenticated'};`);
  };
  const denied = async (sql, pattern = /permission|policy|access|permitted|Membership|owner|Owner|Circle unavailable|Invitation|same post|belong to|uploaded object|ownership/i) => {
    await assert.rejects(db.query(sql), pattern);
  };
  for (const [name, id] of Object.entries(ids)) {
    await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)`, [id, `${name}@circle.test`, JSON.stringify({ name, username: name, adult_confirmed: true })]);
  }
  await as('owner');
  const circle = await scalar(`select (public.create_circle('Private family')).id as value`);
  const discoverable = await scalar(`select (public.create_circle('Discoverable community','','Community',true)).id as value`);
  const post = await scalar(`insert into public.posts(circle_id,body) values(${q(circle)},'Private family update') returning id as value`);
  const ownerComment = await scalar(`insert into public.comments(post_id,body) values(${q(post)},'First comment') returning id as value`);
  await db.query(`insert into public.circle_messages(circle_id,body) values(${q(circle)},'Private conversation')`);
  const mediaPath = `${circle}/${ids.owner}/photo.jpg`;
  await db.query(`insert into storage.objects(bucket_id,name) values('circle-media',${q(mediaPath)})`);
  await db.query(`insert into public.post_media(post_id,storage_path,media_type) values(${q(post)},${q(mediaPath)},'image')`);

  await t.test('migration enables RLS on every application table and keeps buckets private', async () => {
    await db.exec('reset role');
    const tables = (await db.query(`select relname,relrowsecurity from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relkind='r'`)).rows;
    assert.deepEqual(tables.map((x) => x.relname).sort(), ['profiles','circles','circle_members','circle_join_requests','circle_invitations','posts','post_media','comments','post_reactions','circle_messages','notifications','user_blocks','reports'].sort());
    assert.ok(tables.every((x) => x.relrowsecurity));
    assert.equal(await scalar('select count(*)::int as value from storage.buckets where public'), 0);
  });
  await t.test('signup requires and persists adult attestation; profile owner cannot edit it', async () => {
    await db.exec('reset role');
    await assert.rejects(db.query(`insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'child@circle.test','{"name":"No attestation","username":"no_attestation"}')`), /Adult account attestation/);
    await as('owner');
    assert.ok(await scalar('select adult_confirmed_at as value from public.profiles where id=auth.uid()'));
    await denied('update public.profiles set adult_confirmed_at=null where id=auth.uid()');
  });
  await t.test('anonymous callers cannot query profiles, feeds, or privileged RPCs', async () => {
    await as('anon');
    await denied('select * from public.profiles');
    await denied('select * from public.posts');
    await denied(`select public.create_circle('Anonymous')`);
    await denied(`select public.accept_invitation('unknown')`);
  });
  await t.test('discoverability reveals metadata, never private posts or chat', async () => {
    await as('outsider');
    assert.equal(await scalar(`select count(*)::int as value from public.circles where id=${q(circle)}`), 0);
    assert.equal(await scalar(`select count(*)::int as value from public.circles where id=${q(discoverable)}`), 1);
    for (const table of ['posts','comments','post_reactions','post_media','circle_messages','circle_members']) {
      assert.equal(await scalar(`select count(*)::int as value from public.${table}`), 0, table);
    }
    assert.equal(await scalar(`select count(*)::int as value from storage.objects`), 0);
  });
  await t.test('outsiders cannot insert private posts, comments, reactions, chat, or membership', async () => {
    await as('outsider');
    await denied(`insert into public.posts(circle_id,body) values(${q(circle)},'Intrusion')`);
    await denied(`insert into public.comments(post_id,body) values(${q(post)},'Intrusion')`);
    await denied(`insert into public.post_reactions(post_id) values(${q(post)})`);
    await denied(`insert into public.circle_messages(circle_id,body) values(${q(circle)},'Intrusion')`);
    await denied(`insert into public.circle_members(circle_id,user_id,role) values(${q(circle)},${q(ids.outsider)},'owner')`);
    await denied(`select public.request_join(${q(circle)})`);
  });
  await t.test('outsiders cannot enumerate private membership through management error messages', async () => {
    await as('outsider');
    for (const fn of ['change_member_role','remove_circle_member']) {
      const tail = fn === 'change_member_role' ? ",'member'" : '';
      const errors = [];
      for (const target of [ids.owner, ids.member]) {
        try { await db.query(`select public.${fn}(${q(circle)},${q(target)}${tail})`); assert.fail('Expected denial'); }
        catch (error) { errors.push(error.message); }
      }
      assert.equal(errors[0], errors[1]);
    }
  });
  await t.test('pending request grants no content; only a manager can approve', async () => {
    await as('member');
    const req = await scalar(`select (public.request_join(${q(discoverable)})).id as value`);
    assert.equal(await scalar(`select public.is_circle_member(${q(discoverable)}) as value`), false);
    await denied(`select public.review_join_request(${q(req)},true)`);
    await as('owner');
    await db.query(`select public.review_join_request(${q(req)},true)`);
    await as('member');
    assert.equal(await scalar(`select public.is_circle_member(${q(discoverable)}) as value`), true);
    assert.equal(await scalar(`select count(*)::int as value from public.notifications where kind='approval'`), 1);
  });
  await t.test('single-use invitation securely grants private membership', async () => {
    await as('owner');
    const token = await scalar(`select public.create_invitation(${q(circle)},'member@circle.test') as value`);
    assert.equal(token.length, 64);
    assert.equal(await scalar(`select count(*)::int as value from public.circle_invitations where token_hash=${q(token)}`), 0);
    await as('outsider');
    await denied(`select public.accept_invitation(${q(token)})`);
    await as('member');
    assert.equal(await scalar(`select public.accept_invitation(${q(token)}) as value`), circle);
    await denied(`select public.accept_invitation(${q(token)})`);
    assert.equal(await scalar(`select count(*)::int as value from public.posts where id=${q(post)}`), 1);
  });
  await t.test('members cannot forge authors or promote themselves', async () => {
    await as('member');
    await denied(`insert into public.posts(circle_id,author_id,body) values(${q(circle)},${q(ids.owner)},'Forgery')`);
    await denied(`insert into public.circle_messages(circle_id,author_id,body) values(${q(circle)},${q(ids.owner)},'Forgery')`);
    await denied(`update public.circle_members set role='owner' where user_id=${q(ids.member)}`);
    await denied(`select public.change_member_role(${q(circle)},${q(ids.member)},'admin')`);
    await denied(`update public.circles set owner_id=${q(ids.member)} where id=${q(circle)}`);
  });
  await t.test('members can comment, react, and chat; only recipients read notifications', async () => {
    await as('member');
    await db.query(`insert into public.comments(post_id,parent_id,body) values(${q(post)},${q(ownerComment)},'A genuine reply')`);
    await db.query(`insert into public.post_reactions(post_id) values(${q(post)})`);
    await db.query(`insert into public.circle_messages(circle_id,body) values(${q(circle)},'Hello everyone')`);
    assert.equal(await scalar(`select count(*)::int as value from public.circle_messages where circle_id=${q(circle)}`), 2);
    await as('owner');
    assert.equal(await scalar(`select count(*)::int as value from public.notifications where kind in ('reply','reaction')`), 2);
    await denied(`update public.notifications set user_id=${q(ids.outsider)}`);
    await db.query('update public.notifications set read_at=now()');
    await as('outsider');
    assert.equal(await scalar('select count(*)::int as value from public.notifications'), 0);
  });
  await t.test('ordinary post authors cannot delete another member’s comment', async () => {
    await as('member');
    const authored = await scalar(`insert into public.posts(circle_id,body) values(${q(circle)},'My discussion') returning id as value`);
    await as('owner');
    const comment = await scalar(`insert into public.comments(post_id,body) values(${q(authored)},'Another member response') returning id as value`);
    await as('member');
    const deleted = await db.query(`delete from public.comments where id=${q(comment)} returning id`);
    assert.equal(deleted.rows.length, 0);
    assert.equal(await scalar(`select count(*)::int as value from public.comments where id=${q(comment)}`), 1);
    await as('owner');
    await db.query(`delete from public.posts where id=${q(authored)}`);
  });
  await t.test('cross-post replies and cross-circle reports are rejected by constraints', async () => {
    await as('member');
    const otherPost = await scalar(`insert into public.posts(circle_id,body) values(${q(discoverable)},'Other circle') returning id as value`);
    await denied(`insert into public.comments(post_id,parent_id,body) values(${q(otherPost)},${q(ownerComment)},'Bad reply')`);
    await denied(`insert into public.reports(circle_id,post_id,reason) values(${q(discoverable)},${q(post)},'Wrong Circle')`);
    await db.query(`insert into public.reports(circle_id,post_id,reason) values(${q(circle)},${q(post)},'Please review this post')`);
    await denied(`insert into public.reports(circle_id,comment_id,reason) values(${q(discoverable)},${q(ownerComment)},'Wrong Circle')`);
    await db.query(`insert into public.reports(circle_id,comment_id,reason) values(${q(circle)},${q(ownerComment)},'Please review only this comment')`);
  });
  await t.test('media upload ownership, Circle paths, and atomic attachments are validated', async () => {
    await as('member');
    await denied(`insert into storage.objects(bucket_id,name) values('circle-media',${q(`${circle}/${ids.owner}/forged.jpg`)})`);
    await denied(`insert into public.post_media(post_id,storage_path,media_type) values(${q(post)},${q(`${discoverable}/${ids.member}/wrong.jpg`)},'image')`);
    await denied(`select public.create_post(${q(circle)},'No object','[{"storage_path":"${circle}/${ids.member}/missing.jpg","media_type":"image"}]')`);
    assert.equal(await scalar(`select count(*)::int as value from public.posts where body='No object'`), 0);
    const path = `${circle}/${ids.member}/my-photo.jpg`;
    await db.query(`insert into storage.objects(bucket_id,name) values('circle-media',${q(path)})`);
    const created = await scalar(`select (public.create_post(${q(circle)},'',${q(JSON.stringify([{ storage_path: path, media_type: 'image' }]))})).id as value`);
    assert.ok(created);
    assert.equal(await scalar(`select public.can_read_media(${q(path)}) as value`), true);
    await db.query(`delete from public.posts where id=${q(created)}`);
    assert.equal(await scalar(`select public.can_read_media(${q(path)}) as value`), false, 'Deleted-post orphan is unreadable');
  });
  await t.test('profile avatar reads require a live current profile reference', async () => {
    await as('owner');
    const avatar = `${ids.owner}/avatar.jpg`;
    await db.query(`insert into storage.objects(bucket_id,name) values('profile-avatars',${q(avatar)})`);
    await db.query(`update public.profiles set avatar_url=${q(avatar)} where id=auth.uid()`);
    await as('outsider');
    assert.equal(await scalar(`select public.can_read_avatar(${q(avatar)}) as value`), true);
    assert.equal(await scalar(`select public.can_read_avatar('invalid/path') as value`), false);
    await as('owner');
    await db.query(`update public.profiles set avatar_url=null where id=auth.uid()`);
    await as('outsider');
    assert.equal(await scalar(`select public.can_read_avatar(${q(avatar)}) as value`), false);
  });
  await t.test('blocking hides the blocked author’s posts, chat, and stored photos', async () => {
    await as('member');
    await db.query(`insert into public.user_blocks(blocked_id) values(${q(ids.owner)})`);
    assert.equal(await scalar(`select count(*)::int as value from public.posts where id=${q(post)}`), 0);
    assert.equal(await scalar(`select count(*)::int as value from public.circle_messages where author_id=${q(ids.owner)}`), 0);
    assert.equal(await scalar(`select public.can_read_media(${q(mediaPath)}) as value`), false);
    await db.query(`delete from public.user_blocks where blocked_id=${q(ids.owner)}`);
  });
  await t.test('removed member loses old feed, chat, comments, and media access and cannot write', async () => {
    await as('owner');
    await db.query(`select public.remove_circle_member(${q(circle)},${q(ids.member)})`);
    await as('member');
    assert.equal(await scalar(`select count(*)::int as value from public.posts where id=${q(post)}`), 0);
    assert.equal(await scalar(`select count(*)::int as value from public.comments where post_id=${q(post)}`), 0);
    assert.equal(await scalar(`select count(*)::int as value from public.circle_messages where circle_id=${q(circle)}`), 0);
    assert.equal(await scalar(`select public.can_read_media(${q(mediaPath)}) as value`), false);
    const owned = (await db.query('select * from public.owned_media_paths()')).rows;
    assert.ok(owned.every((object) => object.name.split('/')[object.bucket_id === 'circle-media' ? 1 : 0] === ids.member));
    assert.equal(await scalar(`select count(*)::int as value from storage.objects where bucket_id='circle-media' and name like ${q(`${circle}/%`)}`), 0);
    await denied(`insert into public.posts(circle_id,body) values(${q(circle)},'Returned')`);
    await denied(`insert into public.circle_messages(circle_id,body) values(${q(circle)},'Returned')`);
    await denied(`insert into public.comments(post_id,body) values(${q(post)},'Returned')`);
  });
  await t.test('admin cannot appoint admins, demote owners, or remove another admin', async () => {
    await as('owner');
    const token = await scalar(`select public.create_invitation(${q(circle)}) as value`);
    await as('admin'); await db.query(`select public.accept_invitation(${q(token)})`);
    await as('owner'); await db.query(`select public.change_member_role(${q(circle)},${q(ids.admin)},'admin')`);
    await as('admin');
    await denied(`select public.change_member_role(${q(circle)},${q(ids.admin)},'owner')`);
    await denied(`select public.change_member_role(${q(circle)},${q(ids.owner)},'member')`);
    await denied(`select public.remove_circle_member(${q(circle)},${q(ids.owner)})`);
  });
  await t.test('owner cannot leave without transfer; transfer preserves exactly one owner', async () => {
    await as('owner');
    await denied(`select public.remove_circle_member(${q(circle)},${q(ids.owner)})`);
    await db.query(`select public.transfer_circle_ownership(${q(circle)},${q(ids.admin)})`);
    assert.equal(await scalar(`select count(*)::int as value from public.circle_members where circle_id=${q(circle)} and role='owner'`), 1);
    assert.equal(await scalar(`select owner_id as value from public.circles where id=${q(circle)}`), ids.admin);
    await denied(`select public.delete_circle(${q(circle)})`);
  });
  await t.test('expired invitations and unverified email redemption are denied', async () => {
    await as('admin');
    const token = await scalar(`select public.create_invitation(${q(circle)},'invitee@circle.test') as value`);
    await db.exec(`reset role; update auth.users set email_confirmed_at=null where id=${q(ids.invitee)}`);
    await as('invitee'); await denied(`select public.accept_invitation(${q(token)})`);
    await db.exec(`reset role; update auth.users set email_confirmed_at=now() where id=${q(ids.invitee)}; update public.circle_invitations set expires_at=now()-interval '1 minute' where email='invitee@circle.test'`);
    await as('invitee'); await denied(`select public.accept_invitation(${q(token)})`);
  });
  await t.test('account deletion cascades owned Circles and revokes stored-media visibility', async () => {
    await as('admin');
    const avatar = `${ids.admin}/avatar.jpg`;
    await db.query(`insert into storage.objects(bucket_id,name) values('profile-avatars',${q(avatar)})`);
    await db.query(`update public.profiles set avatar_url=${q(avatar)} where id=auth.uid()`);
    await assert.rejects(db.query('select public.delete_account()'), /storage objects/);
    const paths = (await db.query('select * from public.owned_media_paths()')).rows;
    assert.deepEqual(paths, [{ bucket_id: 'profile-avatars', name: avatar }]);
    await db.query(`delete from storage.objects where bucket_id='profile-avatars' and name=${q(avatar)}`);
    await db.query('select public.delete_account()');
    await db.exec('reset role');
    assert.equal(await scalar(`select count(*)::int as value from auth.users where id=${q(ids.admin)}`), 0);
    assert.equal(await scalar(`select count(*)::int as value from public.circles where id=${q(circle)}`), 0);
    await as('owner');
    assert.equal(await scalar(`select public.can_read_media(${q(mediaPath)}) as value`), false);
  });
});
