import { createApp, createRuntime } from './app.js';
const runtime = await createRuntime();
const app = await createApp(runtime);
await app.listen(runtime.c.config.port, runtime.c.config.host);
if (runtime.c.config.worker && process.env.IN_PROCESS_WORKER !== 'false')
  await runtime.jobs.start();
console.log(
  `SALFORD backend listening at ${runtime.c.config.origin}; mode=${runtime.c.config.dbMode}`,
);
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await app.close();
  await runtime.close();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
