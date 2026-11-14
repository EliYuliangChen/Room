import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { mkdirSync, readFileSync, existsSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { phase2Migration } from './migration-phase2.js';
import { voteOutcomeMigration } from './migration-vote-outcomes.js';

// Versioned schema. Later phases add migrations rather than recreating user data.
export const migrations = [
`CREATE TABLE demo_users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, display_email TEXT, created_at TEXT NOT NULL);
CREATE TABLE avatars (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES demo_users(id), label TEXT NOT NULL, source_kind TEXT NOT NULL CHECK(source_kind IN ('preset','uploaded')), image_path TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', final_due_at TEXT NOT NULL, creator_id TEXT NOT NULL REFERENCES demo_users(id), status TEXT NOT NULL DEFAULT 'draft_setup' CHECK(status IN ('draft_setup','ongoing','archived')), join_code TEXT NOT NULL UNIQUE, thumbnail_variant INTEGER NOT NULL CHECK(thumbnail_variant BETWEEN 1 AND 4), created_at TEXT NOT NULL);
CREATE TABLE project_members (project_id TEXT NOT NULL REFERENCES projects(id), user_id TEXT NOT NULL REFERENCES demo_users(id), avatar_id TEXT REFERENCES avatars(id), avatar_layout_json TEXT NOT NULL DEFAULT '{"scale":1,"flip":false,"offsetX":0}', joined_at TEXT NOT NULL, PRIMARY KEY(project_id,user_id));
CREATE TABLE stages (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, sort_order INTEGER NOT NULL);
CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), stage_id TEXT NOT NULL REFERENCES stages(id), parent_task_id TEXT REFERENCES tasks(id), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL, assignee_user_id TEXT REFERENCES demo_users(id), due_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX members_user_idx ON project_members(user_id);
CREATE INDEX stages_project_idx ON stages(project_id,sort_order);
CREATE INDEX tasks_stage_idx ON tasks(stage_id,parent_task_id,sort_order);
CREATE INDEX avatars_owner_idx ON avatars(owner_user_id);
CREATE TRIGGER shallow_tasks BEFORE INSERT ON tasks WHEN NEW.parent_task_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tasks WHERE id=NEW.parent_task_id AND parent_task_id IS NULL AND stage_id=NEW.stage_id AND project_id=NEW.project_id) THEN RAISE(ABORT,'Invalid task parent') END;
END;`, phase2Migration, voteOutcomeMigration,
  (db: Database) => {
    // Earlier version-3 databases predate the sequence column. Check once at
    // upgrade; databases that already have it retain their exact read cursors.
    const columns = db.exec('PRAGMA table_info(project_members)')[0].values;
    if (!columns.some(([, name]) => name === 'chat_read_seq')) {
      db.run('ALTER TABLE project_members ADD COLUMN chat_read_seq INTEGER NOT NULL DEFAULT 0');
      db.run(`UPDATE project_members SET chat_read_seq=COALESCE((
        SELECT MAX(rowid) FROM chat_messages
        WHERE project_id=project_members.project_id AND created_at<=project_members.chat_read_at
      ),0)`);
    }
  },
  (db: Database) => {
    // Version-4 legacy databases can still lack the task submission cursor.
    const columns = db.exec('PRAGMA table_info(tasks)')[0].values;
    if (!columns.some(([, name]) => name === 'active_submission_from')) {
      db.run('ALTER TABLE tasks ADD COLUMN active_submission_from INTEGER NOT NULL DEFAULT 1');
    }
  }
] as const;

export async function openStore(directory: string) {
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, 'app.sqlite');
  const lockfile = path.join(directory, 'app.lock');
  if (existsSync(lockfile)) {
    const pid = Number(readFileSync(lockfile, 'utf8'));
    let alive = true;
    try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
    if (alive) throw new Error('This data directory is already open. Stop the other Project Room API first.');
    unlinkSync(lockfile);
  }
  const lock = openSync(lockfile, 'wx');
  writeFileSync(lock, String(process.pid)); closeSync(lock);
  try {
    const SQL = await initSqlJs();
    let db: Database = existsSync(filename) ? new SQL.Database(readFileSync(filename)) : new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    const persist = () => {
      writeFileSync(`${filename}.tmp`, db.export());
      renameSync(`${filename}.tmp`, filename);
      // sql.js export closes/reopens SQLite internally; restore this per-connection pragma.
      db.run('PRAGMA foreign_keys = ON');
    };
    const store = {
      directory,
      all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T[] {
        const statement = db.prepare(sql);
        try { statement.bind(params); const rows: T[] = []; while (statement.step()) rows.push(statement.getAsObject() as T); return rows; }
        finally { statement.free(); }
      },
      get<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T | undefined { return this.all<T>(sql, params)[0]; },
      run(sql: string, params: SqlValue[] = []) { db.run(sql, params); },
      transaction<T>(work: () => T): T {
        const before = db.export(); db.run('PRAGMA foreign_keys = ON'); db.run('BEGIN IMMEDIATE');
        try { const value = work(); db.run('COMMIT'); persist(); return value; }
        catch (error) { db.close(); db = new SQL.Database(before); db.run('PRAGMA foreign_keys = ON'); throw error; }
      },
      close() { db.close(); unlinkSync(lockfile); }
    };
    const version = Number(store.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0);
    if (version > migrations.length) throw new Error('Database was created by a newer version of Project Room.');
    migrations.slice(version).forEach((migration, index) => store.transaction(() => {
      if (typeof migration === 'string') db.run(migration); else migration(db);
      db.run(`PRAGMA user_version = ${version + index + 1}`);
    }));
    return store;
  } catch (error) { unlinkSync(lockfile); throw error; }
}
export type Store = Awaited<ReturnType<typeof openStore>>;
