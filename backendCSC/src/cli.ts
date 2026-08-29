import path from 'node:path';
import { createRuntime, operations, Runtime } from './app.js';
import { ROOT, connect, loadConfig, migrate } from './core.js';
import { seed } from './seed.js';
const command = process.argv[2];
if (command === 'migrate') {
  const db = await connect(loadConfig());
  try {
    await migrate(db);
    console.log('Migrations applied');
  } finally {
    await db.close();
  }
} else if (command === 'seed') {
  const runtime = await createRuntime();
  try {
    console.log(JSON.stringify(await seed(runtime.c), null, 2));
  } finally {
    await runtime.close();
  }
} else if (command === 'contract') {
  const { default: SwaggerParser } = await import(
    '@apidevtools/swagger-parser'
  );
  await SwaggerParser.validate(path.join(ROOT, 'contracts/openapi.json'));
  // Contract validation must not open a second connection to the local embedded database.
  const runtime = new Runtime({
    config: loadConfig(),
    db: {
      query: async () => {
        throw Error('Database access is not allowed during a contract check');
      },
      tx: async () => {
        throw Error('Database access is not allowed during a contract check');
      },
      close: async () => {},
    },
  });
  try {
    const handlers = runtime.handlers();
    for (const op of operations)
      if (!handlers[op.operationId]) throw Error(`Missing ${op.operationId}`);
    console.log(
      `${operations.length} OpenAPI operations have runtime handlers`,
    );
  } finally {
    await runtime.close();
  }
} else throw Error('Use migrate, seed or contract');
