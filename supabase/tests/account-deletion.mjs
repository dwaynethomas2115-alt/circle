/** Exercises the deployed handler's real code with mocked upstream HTTP only.
 * This does not replace a hosted Auth/Storage integration check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const id = '00000000-0000-0000-0000-000000000001';
const source = stripTypeScriptTypes(await readFile(new URL('../functions/delete-account/index.ts', import.meta.url), 'utf8'));
function handler(fetcher) {
  let handle;
  runInNewContext(source, { Request, Response, fetch: fetcher, Deno: { env: { get: (name) => ({ SUPABASE_URL: 'https://project.test', SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key' })[name] }, serve: (fn) => { handle = fn; } } });
  return handle;
}
const json = (value, status=200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const request = (body={}) => new Request('https://project.test/functions/v1/delete-account', { method: 'POST', headers: { Authorization: 'Bearer user-session-token' }, body: JSON.stringify(body) });

test('account deletion rejects unauthenticated requests before upstream access', async () => {
  const handle = handler(() => { assert.fail('No upstream call is permitted'); });
  const response = await handle(new Request('https://project.test', { method:'POST' }));
  assert.equal(response.status,401);
});
test('account deletion verifies Auth rather than trusting caller-supplied ID', async () => {
  const calls=[];
  const handle=handler(async (url) => { calls.push(url); return json({ error:'Invalid JWT' },401); });
  const response=await handle(request({ userId: id, bucket:'other' }));
  assert.equal(response.status,401);
  assert.deepEqual(calls,['https://project.test/auth/v1/user']);
});
test('account deletion removes only verified caller paths before invoking SQL as caller', async () => {
  const calls=[]; let removed=false;
  const handle=handler(async (url, options) => {
    calls.push(url);
    if(url.endsWith('/auth/v1/user')) return json({ id });
    if(url.includes('owned_media_paths')) {
      assert.equal(options.headers.Authorization,'Bearer user-session-token');
      return json(removed ? [] : [{ bucket_id:'circle-media', name:`circle/${id}/image.jpg` }]);
    }
    if(url.includes('/storage/')) {
      assert.equal(options.headers.Authorization,'Bearer server-only-test-key');
      assert.deepEqual(JSON.parse(options.body),{ prefixes:[`circle/${id}/image.jpg`] });
      removed=true; return json([]);
    }
    if(url.endsWith('/rpc/delete_account')) { assert.ok(removed); assert.equal(options.headers.Authorization,'Bearer user-session-token'); return json(null); }
    assert.fail(url);
  });
  const response=await handle(request({ userId:'another-user', name:'victim.jpg' }));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ deleted:true });
  assert.equal(calls.at(-1),'https://project.test/rest/v1/rpc/delete_account');
});
test('cross-owner media response fails closed without invoking storage deletion', async () => {
  const handle=handler(async (url) => {
    if(url.endsWith('/auth/v1/user')) return json({ id });
    if(url.includes('owned_media_paths')) return json([{ bucket_id:'profile-avatars', name:'another-user/avatar.jpg' }]);
    assert.fail('Must not delete another user’s storage or account');
  });
  assert.equal((await handle(request())).status,500);
});
test('storage failure stops account deletion and is returned as a failure', async () => {
  const handle=handler(async (url) => {
    if(url.endsWith('/auth/v1/user')) return json({ id });
    if(url.includes('owned_media_paths')) return json([{ bucket_id:'profile-avatars', name:`${id}/avatar.jpg` }]);
    if(url.includes('/storage/')) return json({ error:'temporary outage' },503);
    assert.fail('SQL deletion must not run after failed cleanup');
  });
  const response=await handle(request());
  assert.equal(response.status,500);
  assert.match((await response.json()).error,/remove your uploaded media/);
});
test('unconfirmed SQL deletion is never reported as successful', async () => {
  const handle=handler(async (url) => {
    if(url.endsWith('/auth/v1/user')) return json({ id });
    if(url.includes('owned_media_paths')) return json([]);
    return json({ error:'concurrent upload' },400);
  });
  assert.equal((await handle(request())).status,500);
});
test('cleanup that fails to remove objects stops rather than looping', async () => {
  let deletes=0;
  const handle=handler(async (url) => {
    if(url.endsWith('/auth/v1/user')) return json({ id });
    if(url.includes('owned_media_paths')) return json([{ bucket_id:'profile-avatars', name:`${id}/avatar.jpg` }]);
    if(url.includes('/storage/')) { deletes++; return json([]); }
    assert.fail('Account should not be deleted while objects remain');
  });
  assert.equal((await handle(request())).status,500);
  assert.equal(deletes,1);
});
