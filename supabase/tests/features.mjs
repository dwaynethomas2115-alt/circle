import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const ids={owner:'00000000-0000-0000-0000-000000000001',member:'00000000-0000-0000-0000-000000000002',outsider:'00000000-0000-0000-0000-000000000003',other:'00000000-0000-0000-0000-000000000004'};
const q=s=>`'${String(s).replaceAll("'","''")}'`;
const theme={id:'garden',label:'Garden days',prompt:'A quiet garden',accent:'#28634F',background:'#F4F8F1',surface:'#FFFFFF',ink:'#21392E',motif:'garden',source:'preset'};
test('polls, events, themes, and catch-up enforce current Circle membership',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;create publication supabase_realtime;`);
 for(const file of ['202610270001_circle.sql','202610290001_circle_features.sql'])await db.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 const as=async who=>db.exec(`reset role;select set_config('request.jwt.claim.sub',${q(ids[who]||'')},false);set role ${who==='anon'?'anon':who==='service'?'service_role':'authenticated'};`);
 const scalar=async sql=>(await db.query(sql)).rows[0]?.value;
 const deny=async(sql,pattern=/permission|policy|Membership|unavailable|permitted|Manager|closed|future|distinct|Option|contrast|generated|rate limit|revoked|invalid/i)=>assert.rejects(db.query(sql),pattern);
 for(const [name,id]of Object.entries(ids))await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)values($1,$2,now(),$3)',[id,`${name}@circle.test`,JSON.stringify({name,username:name,adult_confirmed:true})]);
 await as('owner');
 const circle=await scalar(`select (public.create_circle('Private community')).id as value`);
 const other=await scalar(`select (public.create_circle('Another community')).id as value`);
 const token=await scalar(`select public.create_invitation(${q(circle)}) as value`);
 await as('member');await db.query(`select public.accept_invitation(${q(token)})`);
 const poll=await scalar(`select (public.create_poll(${q(circle)},'Where should we meet?',array['Garden','Coffee'],now()+interval '1 day')).id as value`);
 const opts=(await db.query(`select * from public.poll_options where poll_id=${q(poll)} order by position`)).rows;
 const event=await scalar(`select (public.create_event(${q(circle)},'Sunday brunch','Bring something to share','Community garden',now()+interval '2 days',now()+interval '2 days 2 hours')).id as value`);
 await t.test('all added tables use RLS and clients cannot bypass function writes',async()=>{
  await db.exec('reset role');const names=['circle_polls','poll_options','poll_votes','circle_events','event_rsvps','circle_read_states','circle_themes','circle_theme_generation_requests','circle_call_revocations'];
  const rows=(await db.query(`select relname,relrowsecurity from pg_class where relname=any($1)`,[names])).rows;assert.equal(rows.length,names.length);assert.ok(rows.every(r=>r.relrowsecurity));
  await as('member');await deny(`insert into public.poll_votes(poll_id,user_id,option_id)values(${q(poll)},${q(ids.owner)},${q(opts[0].id)})`);await deny(`update public.circle_polls set closed=false`);
 });
 await t.test('anonymous access to new data and functions is denied',async()=>{await as('anon');for(const table of ['circle_polls','poll_options','poll_votes','circle_events','event_rsvps','circle_themes','circle_read_states'])await deny(`select * from public.${table}`);await deny(`select public.create_poll(${q(circle)},'Question?',array['A','B'])`);});
 await t.test('outsider cannot read or write any private feature even with known IDs',async()=>{
  await as('outsider');for(const table of ['circle_polls','poll_options','poll_votes','circle_events','event_rsvps','circle_themes','circle_read_states'])assert.equal(await scalar(`select count(*)::int as value from public.${table}`),0,table);
  for(const sql of [`select public.cast_poll_vote(${q(poll)},${q(opts[0].id)})`,`select public.close_poll(${q(poll)})`,`select public.delete_poll(${q(poll)})`,`select public.delete_event(${q(event)})`,`select public.set_event_rsvp(${q(event)},'going')`,`select public.mark_circle_caught_up(${q(circle)})`,`select public.reserve_theme_generation(${q(circle)})`,`select public.save_circle_theme(${q(circle)},${q(JSON.stringify(theme))})`])await deny(sql);
 });
 await t.test('poll options validate, and one voter can change only their single vote',async()=>{
  await as('member');await deny(`select public.create_poll(${q(circle)},'Duplicate?',array['Yes',' yes '])`);await deny(`select public.create_poll(${q(circle)},'Expired?',array['A','B'],now()-interval '1 second')`);
  await db.query(`select public.cast_poll_vote(${q(poll)},${q(opts[0].id)})`);await db.query(`select public.cast_poll_vote(${q(poll)},${q(opts[1].id)})`);
  assert.equal(await scalar(`select count(*)::int as value from public.poll_votes where poll_id=${q(poll)} and user_id=auth.uid()`),1);assert.equal(await scalar(`select option_id as value from public.poll_votes where poll_id=${q(poll)} and user_id=auth.uid()`),opts[1].id);
 });
 await t.test('cross-poll option votes are rejected atomically',async()=>{
  await as('owner');const second=await scalar(`select (public.create_poll(${q(other)},'Other poll?',array['One','Two'])).id as value`);const option=await scalar(`select id as value from public.poll_options where poll_id=${q(second)} limit 1`);
  await as('member');await deny(`select public.cast_poll_vote(${q(poll)},${q(option)})`,/belong/);assert.equal(await scalar(`select option_id as value from public.poll_votes where poll_id=${q(poll)} and user_id=auth.uid()`),opts[1].id);
 });
 await t.test('only author or manager can close/delete; closed and expired polls reject votes',async()=>{
  await as('owner');const p=await scalar(`select (public.create_poll(${q(circle)},'Owner question?',array['A','B'])).id as value`);const option=await scalar(`select id as value from public.poll_options where poll_id=${q(p)} limit 1`);
  await as('member');await deny(`select public.close_poll(${q(p)})`);await deny(`select public.delete_poll(${q(p)})`);
  await as('owner');await db.query(`select public.close_poll(${q(p)})`);await as('member');await deny(`select public.cast_poll_vote(${q(p)},${q(option)})`);
  await db.exec(`reset role;update public.circle_polls set closed=false,closes_at=now()-interval '1 second' where id=${q(p)}`);await as('owner');await deny(`select public.cast_poll_vote(${q(p)},${q(option)})`);
 });
 await t.test('event bounds and single own RSVP are enforced',async()=>{
  await as('member');await deny(`select public.create_event(${q(circle)},'Bad event','','',now()-interval '1 day',now())`);await deny(`select public.create_event(${q(circle)},'Bad event','','',now()+interval '1 day',now())`,/check/);
  await db.query(`select public.set_event_rsvp(${q(event)},'going')`);await db.query(`select public.set_event_rsvp(${q(event)},'maybe')`);assert.equal(await scalar(`select count(*)::int as value from public.event_rsvps where event_id=${q(event)} and user_id=auth.uid()`),1);assert.equal(await scalar(`select response as value from public.event_rsvps where event_id=${q(event)} and user_id=auth.uid()`),'maybe');await deny(`select public.set_event_rsvp(${q(event)},'forged')`,/check/);
 });
 await t.test('catch-up cutoffs are own, monotonic, and cannot hide future content',async()=>{
  await as('member');await db.query(`select public.mark_circle_caught_up(${q(circle)},now()-interval '1 hour')`);const first=await scalar(`select seen_at as value from public.circle_read_states where circle_id=${q(circle)}`);await db.query(`select public.mark_circle_caught_up(${q(circle)},now()-interval '2 hours')`);assert.deepEqual(await scalar(`select seen_at as value from public.circle_read_states where circle_id=${q(circle)}`),first);await deny(`select public.mark_circle_caught_up(${q(circle)},now()+interval '1 day')`);
  await as('owner');assert.equal(await scalar(`select count(*)::int as value from public.circle_read_states`),0);
 });
 await t.test('themes are manager-only, constrained data with accessible contrast',async()=>{
  await as('member');await deny(`select public.save_circle_theme(${q(circle)},${q(JSON.stringify(theme))})`);await as('owner');await db.query(`select public.save_circle_theme(${q(circle)},${q(JSON.stringify(theme))})`);
  for(const bad of [{...theme,motif:'javascript'},{...theme,accent:'url(https://bad.test)'},{...theme,ink:'#FFFFFF'},{...theme,script:'evil'},{...theme,source:'ai'}])await deny(`select public.save_circle_theme(${q(circle)},${q(JSON.stringify(bad))})`);
  await as('member');assert.equal((await db.query(`select theme from public.circle_themes where circle_id=${q(circle)}`)).rows[0].theme.motif,'garden');
 });
 await t.test('AI requests require manager, enforce quota, and only service can complete proposals',async()=>{
  await as('member');await deny(`select public.reserve_theme_generation(${q(circle)})`);await as('owner');const request=await scalar(`select public.reserve_theme_generation(${q(circle)}) as value`);const generated={...theme,id:'generated-one',source:'ai'};
  await deny(`select public.complete_theme_generation(${q(request)},${q(JSON.stringify(generated))})`);await as('service');await db.query(`select public.complete_theme_generation(${q(request)},${q(JSON.stringify(generated))})`);await as('owner');await db.query(`select public.save_circle_theme(${q(circle)},${q(JSON.stringify(generated))})`);
  for(let i=0;i<4;i++)await db.query(`select public.reserve_theme_generation(${q(circle)})`);await deny(`select public.reserve_theme_generation(${q(circle)})`,/rate limit/);
  await as('member');await deny(`select * from public.circle_theme_generation_requests`);
 });
 await t.test('AI provenance cannot be reused across Circles and daily budget spans Circles',async()=>{
  await as('owner');const generated={...theme,id:'generated-one',source:'ai'};await deny(`select public.save_circle_theme(${q(other)},${q(JSON.stringify(generated))})`,/server-generated/);
  // Previous test reserved five in the first Circle. Fill three more groups of five.
  for(const c of [other])for(let i=0;i<5;i++)await db.query(`select public.reserve_theme_generation(${q(c)})`);
  for(let group=0;group<2;group++){
   const c=await scalar(`select (public.create_circle('Budget circle')).id as value`);
   for(let i=0;i<5;i++)await db.query(`select public.reserve_theme_generation(${q(c)})`);
  }
  const last=await scalar(`select (public.create_circle('Over daily budget')).id as value`);
  await deny(`select public.reserve_theme_generation(${q(last)})`,/rate limit/);
 });
 await t.test('Circle AI budget spans admins and completion rechecks current manager role',async()=>{
  await as('owner');const tokens=[];for(const name of ['other','outsider'])tokens.push([name,await scalar(`select public.create_invitation(${q(circle)}) as value`)]);
  let pending;
  for(const [name,token]of tokens){
   await as(name);await db.query(`select public.accept_invitation(${q(token)})`);await as('owner');await db.query(`select public.change_member_role(${q(circle)},${q(ids[name])},'admin')`);await as(name);
   const count=name==='other'?5:2;for(let i=0;i<count;i++)pending=await scalar(`select public.reserve_theme_generation(${q(circle)}) as value`);
  }
  await deny(`select public.reserve_theme_generation(${q(circle)})`,/rate limit/);
  await as('owner');await db.query(`select public.change_member_role(${q(circle)},${q(ids.outsider)},'member')`);
  await as('service');await deny(`select public.complete_theme_generation(${q(pending)},${q(JSON.stringify({...theme,id:'revoked-ai',source:'ai'}))})`,/revoked/);
 });
 await t.test('generic feature notifications reveal no event location or poll text',async()=>{
  await as('owner');const notices=(await db.query(`select * from public.notifications where circle_id=${q(circle)}`)).rows;assert.ok(notices.some(n=>n.title==='A new poll in your Circle'));assert.ok(notices.some(n=>n.title==='A new event in your Circle'));assert.ok(notices.every(n=>!n.title.includes('Sunday')&&!n.title.includes('meet?')));
 });
 await t.test('removed member loses data and actions; readstate cascades and durable call revoke is service-only',async()=>{
  await as('owner');await db.query(`select public.remove_circle_member(${q(circle)},${q(ids.member)})`);await as('member');for(const table of ['circle_polls','poll_options','poll_votes','circle_events','event_rsvps','circle_themes','circle_read_states'])assert.equal(await scalar(`select count(*)::int as value from public.${table}`),0,table);
  for(const sql of [`select public.cast_poll_vote(${q(poll)},${q(opts[0].id)})`,`select public.set_event_rsvp(${q(event)},'going')`,`select public.mark_circle_caught_up(${q(circle)})`,`select public.delete_poll(${q(poll)})`,`select public.delete_event(${q(event)})`,`select * from public.pending_circle_call_revocations()`])await deny(sql);
  await as('service');const revokes=(await db.query('select * from public.pending_circle_call_revocations()')).rows;assert.ok(revokes.some(r=>r.circle_id===circle&&r.user_id===ids.member));await db.query(`select public.ack_circle_call_revocation(${q(revokes[0].id)})`);assert.equal((await db.query('select * from public.pending_circle_call_revocations()')).rows.length,0);
 });
});
