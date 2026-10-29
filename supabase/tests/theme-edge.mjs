/** Executes the real handler; upstream Auth/DB/OpenAI HTTP is mocked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=stripTypeScriptTypes(await readFile(new URL('../functions/generate-circle-theme/index.ts',import.meta.url),'utf8')).replace(/export\s*\{\s*\};?/,'');
const circle='00000000-0000-0000-0000-000000000001';
const requestId='00000000-0000-0000-0000-000000000099';
const palette={label:'Quiet garden',accent:'#28634F',background:'#F4F8F1',surface:'#FFFFFF',ink:'#21392E',motif:'garden'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const req=(body={circleId:circle,prompt:'A quiet garden'},auth=true)=>new Request('https://project.test/functions/v1/generate-circle-theme',{method:'POST',headers:auth?{Authorization:'Bearer user-token'}:{},body:JSON.stringify(body)});
function setup({role='owner',key=true,reserveStatus=200,paletteValue=palette,openAIStatus=200,recordStatus=200,authStatus=200}={}){
 let handle;const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return json({id:circle},authStatus);
  if(url.endsWith('/rpc/circle_role_for'))return json(role);
  if(url.endsWith('/rpc/reserve_theme_generation'))return reserveStatus===200?json(requestId):json({message:'Theme generation rate limit reached'},reserveStatus);
  if(url==='https://api.openai.com/v1/chat/completions')return json({choices:[{message:{content:JSON.stringify(paletteValue)}}]},openAIStatus);
  if(url.endsWith('/rpc/complete_theme_generation'))return json(null,recordStatus);
  assert.fail(`Unexpected upstream ${url}`);
 };
 runInNewContext(source,{Request,Response,AbortSignal,crypto:webcrypto,fetch:fetcher,Deno:{env:{get:name=>({SUPABASE_URL:'https://project.test',SUPABASE_SERVICE_ROLE_KEY:'server-key',OPENAI_API_KEY:key?'openai-test-key':undefined})[name]},serve:fn=>{handle=fn;}}});
 return{handle,calls};
}
test('theme generation rejects missing auth without contacting upstreams',async()=>{const{handle,calls}=setup();assert.equal((await handle(req(undefined,false))).status,401);assert.equal(calls.length,0);});
test('invalid expired auth cannot call role lookup, quota, or OpenAI',async()=>{const{handle,calls}=setup({authStatus:401});assert.equal((await handle(req())).status,401);assert.equal(calls.length,1);});
test('members and outsiders cannot generate themes or incur AI requests',async()=>{for(const role of ['member','moderator',null]){const{handle,calls}=setup({role});assert.equal((await handle(req())).status,403);assert.equal(calls.length,2);}});
test('missing server key reports configuration without fake AI output',async()=>{const{handle,calls}=setup({key:false});const response=await handle(req());assert.equal(response.status,503);assert.match((await response.json()).error,/server-side/);assert.ok(!calls.some(c=>c.url.includes('openai')));});
test('rate limit denies before any chargeable OpenAI request',async()=>{const{handle,calls}=setup({reserveStatus:400});assert.equal((await handle(req())).status,429);assert.ok(!calls.some(c=>c.url.includes('openai')));});
test('oversized prompts are rejected before quota or OpenAI',async()=>{const{handle,calls}=setup();assert.equal((await handle(req({circleId:circle,prompt:'x'.repeat(301)}))).status,400);assert.equal(calls.length,0);});
test('AI receives only explicit theme prompt and fixed instructions',async()=>{
 const{handle,calls}=setup();assert.equal((await handle(req())).status,200);
 const call=calls.find(c=>c.url.includes('api.openai.com'));
 const body=JSON.parse(call.options.body);assert.equal(body.messages.length,2);assert.equal(body.messages[1].content,'A quiet garden');assert.ok(!call.options.body.includes(circle));assert.equal(call.options.headers.Authorization,'Bearer openai-test-key');
});
test('invalid motifs, CSS, dark or unreadable colors, and extra AI keys fail closed',async()=>{
 for(const bad of [{...palette,motif:'html'},{...palette,accent:'url(https://bad.test)'},{...palette,ink:'#FFFFFF'},{...palette,background:'#111111',ink:'#FFFFFF'},{...palette,script:'bad'}]){
  const{handle,calls}=setup({paletteValue:bad});assert.equal((await handle(req())).status,502);assert.ok(!calls.some(c=>c.url.includes('complete_theme')));
 }
});
test('successful palette becomes server-ID proposal recorded before client preview',async()=>{
 const{handle,calls}=setup();const response=await handle(req());assert.equal(response.status,200);const{theme}=await response.json();assert.equal(theme.source,'ai');assert.match(theme.id,/^[0-9a-f-]{36}$/);assert.equal(theme.prompt,'A quiet garden');assert.equal(Object.keys(theme).length,9);
 const recorded=calls.find(c=>c.url.includes('complete_theme'));assert.ok(recorded);assert.equal(recorded.options.headers.Authorization,'Bearer server-key');assert.deepEqual(JSON.parse(recorded.options.body),{p_request:requestId,p_theme:theme});
 assert.ok(!calls.some(c=>c.url.includes('save_circle_theme')),'generation does not auto-save');
});
test('provider failure and revoked permission cannot return a successful theme',async()=>{for(const options of [{openAIStatus:503},{recordStatus:403}]){const{handle}=setup(options);assert.notEqual((await handle(req())).status,200);}});
