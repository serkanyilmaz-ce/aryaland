import test from 'node:test';
import assert from 'node:assert/strict';
import {createBudgetHandler,tokenHash} from '../supabase/functions/budget/handler.ts';
const userId='f164c3fc-942b-4fd4-b221-cc386af4625f';const houseId='4e0e2695-c9d8-4dce-b185-a09e504652cf';const origin='https://aryaland.example';
const env={url:'https://demo.supabase.co',publicKey:'public-test-key',serviceKey:'server-only-test-key',origins:[origin]};
const grant='a'.repeat(64);const auth='Bearer '+'token-for-test'.repeat(4);
function request(action:string,extra:Record<string,unknown>={},headers:Record<string,string>={}){return new Request(origin+'/budget',{method:'POST',headers:{Origin:origin,Authorization:auth,'Content-Type':'application/json',...headers},body:JSON.stringify({action,...extra})})}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
function backend(options:{allowed?:boolean;validGrant?:boolean;passwordOK?:boolean;rateAllowed?:boolean}={}){
 const calls:{url:string;body:any;method:string}[]=[];
 const fetcher:typeof fetch=async(input,init)=>{const url=String(input);const body=init?.body?JSON.parse(String(init.body)):null;const method=init?.method||'GET';calls.push({url,body,method});
  if(url.endsWith('/auth/v1/user'))return json({id:userId,email:'person@example.test'});
  if(url.includes('/household_members?'))return json([{household_id:houseId,can_manage_budget:options.allowed!==false}]);
  if(url.includes('consume_budget_unlock_attempt'))return json(options.rateAllowed!==false);
  if(url.includes('/auth/v1/token?'))return options.passwordOK===false?json({error:'invalid'},400):json({access_token:'temporary-proof-token',user:{id:userId}});
  if(url.includes('/auth/v1/logout'))return json({});
  if(url.includes('/budget_grants?'))return json(method==='GET'&&options.validGrant?[{token_hash:'hash'}]:[]);
  if(url.endsWith('/budget_grants'))return json([body]);
  if(url.includes('/budget_transactions'))return json([{id:'transaction',amount_cents:100}]);
  throw new Error('Unexpected route '+url);
 };return {calls,handler:createBudgetHandler(env,fetcher,()=>Date.parse('2026-10-05T12:00:00Z'))};
}
test('no auth or wrong origin is rejected before any database call',async()=>{const {handler,calls}=backend();assert.equal((await handler(request('list',{}, {Authorization:''}))).status,401);assert.equal((await handler(request('list',{}, {Origin:'https://elsewhere.test'}))).status,403);assert.equal(calls.length,0)});
test('member without budget permission never reaches financial tables',async()=>{const {handler,calls}=backend({allowed:false});assert.equal((await handler(request('list',{month:'2026-10'},{'X-Budget-Token':grant}))).status,403);assert.equal(calls.some(c=>c.url.includes('/budget_transactions')),false)});
test('logged in alone cannot read budget; expired grant fails closed',async()=>{const {handler,calls}=backend();assert.equal((await handler(request('list',{month:'2026-10'}))).status,403);assert.equal((await handler(request('list',{month:'2026-10'},{'X-Budget-Token':grant}))).status,403);assert.equal(calls.some(c=>c.url.includes('/budget_transactions')),false);const query=calls.find(c=>c.url.includes('budget_grants?'))!.url;assert.ok(query.includes('user_id=eq.'+userId));assert.ok(query.includes('household_id=eq.'+houseId));assert.ok(query.includes('expires_at=gt.'))});
test('valid grant reads only the authenticated household and requested month',async()=>{const {handler,calls}=backend({validGrant:true});const r=await handler(request('list',{month:'2026-10',household_id:'attacker-controlled'},{'X-Budget-Token':grant}));assert.equal(r.status,200);const call=calls.find(c=>c.url.includes('budget_transactions'))!;assert.ok(call.url.includes('household_id=eq.'+houseId));assert.ok(call.url.includes('date=gte.2026-10-01'));assert.ok(call.url.includes('date=lt.2026-11-01'));assert.ok(!call.url.includes('attacker-controlled'));assert.equal(r.headers.get('Cache-Control'),'no-store, private')});
test('password proof mints a 10-minute grant and stores only its hash',async()=>{const {handler,calls}=backend();const r=await handler(request('unlock',{password:'correct-test-password'}));assert.equal(r.status,200);const result=await r.json();assert.match(result.grant,/^[a-f0-9]{64}$/);assert.equal(result.expires_at,Date.parse('2026-10-05T12:10:00Z'));const persisted=calls.find(c=>c.url.endsWith('/budget_grants'))!.body;assert.equal(persisted.token_hash,await tokenHash(result.grant));assert.equal(persisted.user_id,userId);assert.equal(persisted.household_id,houseId);assert.equal(JSON.stringify(persisted).includes('correct-test-password'),false);assert.ok(calls.some(c=>c.url.includes('/logout?scope=local')))});
test('bad password or rate limit never mints a grant',async()=>{for(const options of [{passwordOK:false},{rateAllowed:false}]){const {handler,calls}=backend(options);const r=await handler(request('unlock',{password:'wrong'}));assert.ok([401,429].includes(r.status));assert.equal(calls.some(c=>c.url.endsWith('/budget_grants')),false)}});
test('integer cents and dates are validated before a financial write',async()=>{const {handler,calls}=backend({validGrant:true});const r=await handler(request('add',{transaction:{id:userId,type:'expense',amount_cents:0.5,date:'2026-10-05',category:'Ev',description:'test',paid_by:'Serkan'}},{'X-Budget-Token':grant}));assert.equal(r.status,400);assert.equal(calls.some(c=>c.url.includes('/budget_transactions')),false)});
