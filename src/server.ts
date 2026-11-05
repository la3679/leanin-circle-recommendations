import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { loadSnapshot, openDatabase } from './database.js';
import { Recommender } from './recommendations.js';

const path = resolve(process.env.DATABASE_PATH ?? './var/circles.sqlite');
if (!existsSync(path)) throw new Error(`Database not found at ${path}. Run npm run seed first.`);
const db = openDatabase(path);
const snapshot = (() => { try { return loadSnapshot(db); } finally { db.close(); } })();
const recommender = new Recommender(snapshot, process.env.AS_OF ?? snapshot.asOf);
const rawPort = process.env.PORT ?? '3000';
if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
const host = process.env.HOST ?? '127.0.0.1';
const server = createApp(recommender).listen(Number(rawPort), host, () => {
  console.log(`Circle API: http://${host}:${rawPort} (snapshot clock ${recommender.asOf})`);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  server.close(() => { process.exitCode = 0; });
  server.closeIdleConnections();
});
