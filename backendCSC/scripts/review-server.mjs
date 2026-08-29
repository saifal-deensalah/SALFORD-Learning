// Explicit disposable UI-test server. It never connects to Supabase.
import {randomUUID, randomBytes} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createRuntime, createApp} from '../dist/app.js';
import {seed} from '../dist/seed.js';
import {ROOT} from '../dist/core.js';
const local = JSON.parse(await fs.readFile(path.join(ROOT, '../frontend/src/services/local-config.json'), 'utf8'));
const dataDir = path.join(ROOT, '.local', 'review-sandboxes', randomUUID());
const runtime = await createRuntime({config: {
  env: 'test', dbMode: 'embedded', databaseUrl: undefined, databaseSchema: 'public',
  dataDir, port: local.apiPort, host: '127.0.0.1', origin: `http://127.0.0.1:${local.apiPort}`,
  secret: randomBytes(48).toString('base64url'), mailMode: 'local', storageMode: 'local', billingMode: 'demo',
}});
await seed(runtime.c, 'Local-review-test-2026!'); // Public fixture password, sandbox only.
const reviewId = path.basename(dataDir);
const handlers = runtime.handlers.bind(runtime);
runtime.handlers = c => ({...handlers(c), liveness: async () => ({status: 'ok', version: `review-${reviewId}`})});
const handle = runtime.handle.bind(runtime);
runtime.handle = async (operation, req, res) => {
  const json = res.json.bind(res);
  res.json = value => {
    if (value?.error) console.log(JSON.stringify({operation: operation.operationId, status: res.statusCode, code: value.error.code}));
    return json(value);
  };
  return handle(operation, req, res);
};
const app = await createApp(runtime);
await app.listen(local.apiPort, '127.0.0.1');
await runtime.jobs.start();
await fs.writeFile(path.join(ROOT, '.local/active-review-sandbox.json'), JSON.stringify({reviewId, dataDir, pid: process.pid, origin: runtime.c.config.origin}));
console.log(JSON.stringify({mode: 'ISOLATED TEST DATABASE', port: local.apiPort, dataDir, supabaseUsed: false}));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (closing) return;
  closing = true;
  await app.close(); await runtime.close(); process.exit(0);
});
