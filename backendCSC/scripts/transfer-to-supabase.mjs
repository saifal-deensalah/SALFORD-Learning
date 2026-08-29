// One-time, explicit transfer. Keeps a private snapshot; refuses a nonempty target.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, connect, loadConfig } from '../dist/core.js';

const privateDir = path.join(ROOT, '.local');
const credentials = JSON.parse(fs.readFileSync(path.join(privateDir, 'supabase-connection.json'), 'utf8'));
if (!credentials.host || !credentials.projectId) throw Error('Verify the Supabase connection first.');
const source = await connect(loadConfig({dbMode:'embedded', dataDir:privateDir}));
let snapshot;
try {
  snapshot = await source.tx(async db => {
    const names = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename");
    const tables = {};
    for (const {tablename} of names) {
      if (!/^[a-z_]+$/.test(tablename)) throw Error('Unexpected table name');
      tables[tablename] = await db.query(`SELECT * FROM "${tablename}"`);
    }
    return {createdAt:new Date().toISOString(),tables};
  });
  const backup = path.join(privateDir, `supabase-backup-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(snapshot), {flag:'wx',mode:0o600});
  console.log('Local snapshot saved:', path.basename(backup));
} finally {await source.close();}

const pool = new pg.Pool({
  host:credentials.host, port:credentials.port, database:'postgres',
  user:`${credentials.username}.${credentials.projectId}`, password:credentials.password,
  ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.join(privateDir,'supabase-ca.crt'),'utf8')},
  max:1, connectionTimeoutMillis:10000,
});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SET CONSTRAINTS ALL DEFERRED');
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    const existing = await client.query(`SELECT 1 FROM csc."${table}" LIMIT 1`);
    if (existing.rowCount) throw Error(`Target table ${table} is not empty; nothing will be overwritten.`);
    if (!rows.length) continue;
    // Force a fresh login after cutover; keep history and user data intact.
    if (table === 'auth_sessions') for (const row of rows) row.revoked_at = new Date().toISOString();
    await client.query(`INSERT INTO csc."${table}" SELECT * FROM json_populate_recordset(NULL::csc."${table}", $1::json)`, [JSON.stringify(rows)]);
  }
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    const result = await client.query(`SELECT count(*)::int AS count FROM csc."${table}"`);
    if (result.rows[0].count !== rows.length) throw Error(`Count mismatch: ${table}`);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({transferredTables:Object.keys(snapshot.tables).length,rows:Object.values(snapshot.tables).reduce((n,rows)=>n+rows.length,0)}));
} catch(error) {
  await client.query('ROLLBACK');
  throw error;
} finally {client.release();await pool.end();}
