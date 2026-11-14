import path from 'node:path';
import { openStore } from './db.js';
import { createApp } from './app.js';
const directory = path.resolve(process.env.DATA_DIR || 'data');
const store = await openStore(directory);
const port = Number(process.env.API_PORT || 3001);
const server = createApp(store, { serveClient: true }).listen(port, '127.0.0.1', () => console.log(`Project Room API: http://127.0.0.1:${port} · local SQLite: ${directory}`));
let stopping = false;
function shutdown() { if (stopping) return; stopping = true; server.close(() => { store.close(); process.exit(0); }); server.closeIdleConnections(); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
server.on('error', error => { console.error(error); store.close(); process.exit(1); });
