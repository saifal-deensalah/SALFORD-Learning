// Writes are allowed only against our explicitly identified disposable test server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { ROOT } from '../dist/core.js';

async function main() {
assert(process.argv.includes('--sandbox'), 'Use --sandbox with scripts/review-server.mjs. Cloud writes are not allowed by this test.');
const sandbox = JSON.parse(await fs.readFile(path.join(ROOT, '.local/active-review-sandbox.json'), 'utf8'));
assert(sandbox.origin.startsWith('http://127.0.0.1:'), 'Expected a loopback test server');
const fenceResponse = await fetch(`${sandbox.origin}/v1/health/live`, {signal: AbortSignal.timeout(5000)});
assert.equal(fenceResponse.status, 200, 'Refusing to write: API is not the review server');
const fence = await fenceResponse.json();
assert(fence.data?.version === `review-${sandbox.reviewId}`, 'Refusing to write: test database identity mismatch');
const mailDir = path.join(sandbox.dataDir, 'mail');
const base = `${sandbox.origin}/v1`;
const email = `qa-${Date.now()}@example.test`, password = randomBytes(24).toString('base64url');
const installationId = randomUUID();
let auth;
const results = [];
async function call(route, method = 'GET', body, expected = 200, token = auth?.accessToken, key) {
  const response = await fetch(base + route, {
    method, signal:AbortSignal.timeout(60000),
    headers:{...(body ? {'Content-Type':'application/json'}:{}),...(token ? {Authorization:`Bearer ${token}`} : {}),...(key ? {'Idempotency-Key':key} : {})},
    body:body ? JSON.stringify(body) : undefined,
  });
  const json = response.status === 204 ? undefined : await response.json();
  assert.equal(response.status, expected, `${method} ${route}: ${json?.error?.code || response.status}`);
  results.push({route,status:response.status});
  return json?.data;
}
await call('/health/ready');
await call('/billing/demo-purchases','POST',{planId:randomUUID()},401,undefined,randomUUID());
await call('/auth/register','POST',{email,password,name:'QA payment learner'},202);
await call('/auth/login','POST',{email,password:'wrong-password',installationId,rememberMe:false},401);
auth = await call('/auth/login','POST',{email,password,installationId,rememberMe:false});
assert.equal(auth.user.emailVerified,false);
const plans = await call('/billing/demo-plans');
const plan = plans.find(p=>p.code==='basic');
assert(plan);
await call('/billing/demo-purchases','POST',{planId:plan.id},403,auth.accessToken,randomUUID());
const verificationRequestedAt = Date.now();
await call('/auth/email/verification-requests','POST',{email},202);
let emailToken;
for (let attempt=0; attempt<30 && !emailToken; attempt++) {
  for (const name of await fs.readdir(mailDir).catch(()=>[])) {
    const file = path.join(mailDir,name);
    if ((await fs.stat(file)).mtimeMs < verificationRequestedAt) continue;
    const message = JSON.parse(await fs.readFile(file,'utf8'));
    if (message.to === email) emailToken = message.text.match(/token=([^\s&]+)/)?.[1];
  }
  if (!emailToken) await new Promise(resolve=>setTimeout(resolve,1000));
}
assert(emailToken, 'Local verification email must be delivered by the worker');
await call('/auth/email/verify','POST',{token:emailToken});
assert.equal((await call('/me')).emailVerified,true);
const key = randomUUID();
const purchase = await call('/billing/demo-purchases','POST',{planId:plan.id},201,auth.accessToken,key);
assert.equal(purchase.status,'succeeded');
assert.equal((await call('/billing/demo-purchases','POST',{planId:plan.id},201,auth.accessToken,key)).id,purchase.id);
assert.equal((await call('/billing/demo-purchases','POST',{planId:plan.id},201,auth.accessToken,randomUUID())).id,purchase.id);
const subscriptions = await call('/me/subscriptions');
assert.equal(subscriptions.length,1);
assert.equal(subscriptions[0].accessActive,true);
await call('/admin/demo-payments','GET',undefined,403);
auth = await call('/auth/refresh','POST',{refreshToken:auth.refreshToken,installationId});
await call('/me');
await call('/auth/logout','POST',undefined,204);
await call('/me','GET',undefined,401);
await fs.writeFile(path.join(sandbox.dataDir,'auth-payment-smoke-account.json'),JSON.stringify({email,password,note:'Disposable local QA account; never created on Supabase'},null,2),{mode:0o600});
await fs.mkdir(path.join(ROOT, 'test-results'), {recursive: true});
await fs.writeFile(path.join(ROOT,'test-results','auth-payment-sandbox.json'),JSON.stringify({createdAt:new Date().toISOString(),database:'isolated-local',checks:results},null,2));
console.log(JSON.stringify({passed:results.length,verifiedEmail:true,payment:'succeeded',duplicatePurchases:0,logoutRevoked:true}));
}
main().catch(error => {
  console.error(JSON.stringify({status: 'failed', code: error.code || 'CHECK_FAILED',
    reason: error instanceof assert.AssertionError ? error.message : 'Sandbox check failed; no credentials printed.'}));
  process.exitCode = 1;
});
