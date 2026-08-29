import { createRuntime } from './app.js';
const runtime = await createRuntime();
if (runtime.c.config.dbMode === 'embedded')
  throw Error(
    'Embedded mode runs its worker inside the API process. Use PostgreSQL for a standalone worker.',
  );
await runtime.jobs.start();
console.log('SALFORD worker running');
const keepAlive = setInterval(() => {}, 60000);
const close = async () => {
  clearInterval(keepAlive);
  await runtime.close();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
