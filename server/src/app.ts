import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { PNG } from 'pngjs';
import { z, ZodError } from 'zod';
import { randomUUID, randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Store } from './db.js';
import { ApiError } from './errors.js';
import { readProject } from './project-view.js';
import { registerWorkflows } from './routes-workflows.js';
import { PRESET_PATHS } from '../../shared/presets.js';
import { PRESETS, type Project, type Stage, type Member, type DemoUser, type Avatar, DEFAULT_LAYOUT } from '../../shared/types.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const due = z.string().datetime({ offset: true });
const task = z.object({ title: text(160), subtasks: z.array(z.object({ title: text(160) }).strict()).max(30).default([]) }).strict();
const projectInput = z.object({ name: text(100), description: z.string().trim().max(1500).default(''), final_due_at: due, stages: z.array(z.object({ title: text(100), tasks: z.array(task).max(50) }).strict()).min(1).max(12) }).strict().refine(p => p.stages.reduce((count, s) => count + s.tasks.reduce((n, t) => n + 1 + t.subtasks.length, 0), 0) <= 300, 'Use at most 300 tasks and subtasks.');
const avatarLayout = z.object({ scale: z.number().min(0.6).max(1.6), flip: z.boolean(), offsetX: z.number().min(-45).max(45) }).strict();
const selection = z.object({ avatar_id: z.string().uuid(), layout: avatarLayout });
const now = () => new Date().toISOString();

export function createApp(store: Store, options: { serveClient?: boolean } = {}) {
  const app = express();
  const uploads = path.join(store.directory, 'uploads'); mkdirSync(uploads, { recursive: true });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store');
      const origin = req.get('origin');
      if (origin) {
        let local = false;
        try { const u = new URL(origin); local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && ['http:', 'https:'].includes(u.protocol); } catch { /* reject */ }
        if (!local) return next(new ApiError(403, 'Only this local demo can access the API.'));
      }
    }
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  const userId = (req: Request) => {
    const id = req.get('x-demo-user-id') ?? (/\/(image|download)$/.test(req.path) ? String(req.query.user ?? '') : '');
    if (!id || !store.get('SELECT id FROM demo_users WHERE id=?', [id])) throw new ApiError(401, 'Choose a local demo profile first.');
    return id;
  };
  const requireMember = (projectId: string, user: string) => {
    if (!store.get('SELECT user_id FROM project_members WHERE project_id=? AND user_id=?', [projectId, user])) throw new ApiError(403, 'This project is not part of your local profile. Join using its invitation code.');
    const project = store.get<Project>('SELECT * FROM projects WHERE id=?', [projectId]);
    if (!project) throw new ApiError(404, 'Project not found.');
    return project;
  };
  const detail = (id:string) => readProject(store,id);
  const ownedAvatar = (id: string, user: string) => {
    if (!store.get('SELECT id FROM avatars WHERE id=? AND owner_user_id=?', [id, user])) throw new ApiError(400, 'Choose an avatar saved to your current profile.');
  };
  const insertPlan = (id: string, stages: z.infer<typeof projectInput>['stages']) => stages.forEach((stage, index) => {
    const stageId = randomUUID(); store.run('INSERT INTO stages (id,project_id,title,sort_order) VALUES (?,?,?,?)', [stageId, id, stage.title, index]);
    stage.tasks.forEach((t, index) => {
      const taskId = randomUUID(); store.run('INSERT INTO tasks (id,project_id,stage_id,parent_task_id,title,sort_order,created_at) VALUES (?,?,?,NULL,?,?,?)', [taskId, id, stageId, t.title, index, now()]);
      t.subtasks.forEach((sub, index) => store.run('INSERT INTO tasks (id,project_id,stage_id,parent_task_id,title,sort_order,created_at) VALUES (?,?,?,?,?,?,?)', [randomUUID(), id, stageId, taskId, sub.title, index, now()]));
    });
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, phase: 3, storage: 'SQLite', mode: 'local-only' }));
  app.get('/api/demo-users', (_req, res) => res.json(store.all<DemoUser>('SELECT * FROM demo_users ORDER BY created_at,id')));
  app.post('/api/demo-users', (req, res) => {
    const body = z.object({ display_name: text(60), display_email: z.string().trim().max(200).optional() }).strict().parse(req.body);
    const user = { id: randomUUID(), display_name: body.display_name, display_email: body.display_email || null, created_at: now() };
    store.transaction(() => store.run('INSERT INTO demo_users VALUES (?,?,?,?)', Object.values(user)));
    res.status(201).json(user);
  });
  app.get('/api/demo-session', (req, res) => res.json(store.get<DemoUser>('SELECT * FROM demo_users WHERE id=?', [userId(req)])));
  app.get('/api/projects', (req, res) => res.json(store.all<{ project_id: string }>('SELECT project_id FROM project_members WHERE user_id=?', [userId(req)]).map(m => detail(m.project_id))));
  app.post('/api/projects', (req, res) => {
    const user = userId(req), body = projectInput.parse(req.body), id = randomUUID();
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string; do { code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (store.get('SELECT id FROM projects WHERE join_code=?', [code]));
    store.transaction(() => {
      store.run('INSERT INTO projects (id,name,description,final_due_at,creator_id,join_code,thumbnail_variant,created_at) VALUES (?,?,?,?,?,?,?,?)', [id, body.name, body.description, body.final_due_at, user, code, randomInt(1, 5), now()]);
      store.run('INSERT INTO project_members (project_id,user_id,joined_at) VALUES (?,?,?)', [id, user, now()]); insertPlan(id, body.stages);
    });
    res.status(201).json(detail(id));
  });
  app.get('/api/projects/:id', (req, res) => { requireMember(req.params.id, userId(req)); res.json(detail(req.params.id)); });
  app.put('/api/projects/:id/draft', (req, res) => {
    const user = userId(req), project = requireMember(req.params.id, user), body = projectInput.parse(req.body);
    if (project.creator_id !== user) throw new ApiError(403, 'Only the project creator can edit this draft.');
    if (project.status !== 'draft_setup') throw new ApiError(409, 'Only draft plans can be edited directly.');
    if(store.get('SELECT id FROM tasks WHERE project_id=? AND (assignee_user_id IS NOT NULL OR due_at IS NOT NULL)',[project.id])||store.get('SELECT id FROM shared_resources WHERE project_id=?',[project.id]))throw new ApiError(409,'Use the Whiteboard to edit this draft while retaining assignments and shared resources.');
    store.transaction(() => {
      store.run('UPDATE projects SET name=?,description=?,final_due_at=? WHERE id=?', [body.name, body.description, body.final_due_at, project.id]);
      store.run('DELETE FROM tasks WHERE project_id=? AND parent_task_id IS NOT NULL', [project.id]);
      store.run('DELETE FROM tasks WHERE project_id=?', [project.id]); store.run('DELETE FROM stages WHERE project_id=?', [project.id]); insertPlan(project.id, body.stages);
    }); res.json(detail(project.id));
  });
  app.post('/api/projects/:id/archive-draft', (req, res) => {
    const user = userId(req), project = requireMember(req.params.id, user);
    if (project.creator_id !== user) throw new ApiError(403, 'Only the creator can archive this draft.');
    if (project.status !== 'draft_setup') throw new ApiError(409, 'Only an unconfirmed draft can be archived directly.');
    const count = store.get<{ count: number }>('SELECT COUNT(*) AS count FROM project_members WHERE project_id=?', [project.id])!.count;
    if (count !== 1) throw new ApiError(409, 'Other members have joined. Use the team Finish Project process instead.');
    const archivedAt = now();
    store.transaction(() => {
      store.run("UPDATE projects SET status='archived',archived_at=? WHERE id=?", [archivedAt, project.id]);
      store.run('INSERT INTO activity_events (id,project_id,actor_id,event_kind,entity_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)', [randomUUID(),project.id,user,'draft_archived',project.id,JSON.stringify({reason:'The creator archived a draft before anyone else joined.'}),archivedAt]);
    });
    res.json(detail(project.id));
  });
  app.get('/api/invitations/:code', (req, res) => {
    const user = userId(req), code = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{8}$/, 'Enter an eight-character join code.').parse(req.params.code);
    const project = store.get<Project>('SELECT * FROM projects WHERE join_code=?', [code]);
    if (!project) throw new ApiError(404, 'That invitation was not found in this local demo. Check the code.');
    if (project.status === 'archived') throw new ApiError(409, 'This project is archived and is no longer accepting members.');
    const members = store.all('SELECT user_id FROM project_members WHERE project_id=?', [project.id]);
    res.json({ id: project.id, name: project.name, final_due_at: project.final_due_at, member_count: members.length, is_member: members.some(m => m.user_id === user), join_code: code });
  });
  app.post('/api/projects/:id/join', (req, res) => {
    const user = userId(req), body = selection.extend({ code: z.string().trim().toUpperCase() }).strict().parse(req.body);
    store.transaction(() => {
      const project = store.get<Project>('SELECT * FROM projects WHERE id=? AND join_code=?', [req.params.id, body.code]);
      if (!project) throw new ApiError(404, 'Invitation not found.');
      if (project.status === 'archived') throw new ApiError(409, 'This project is archived.');
      if (store.get('SELECT user_id FROM project_members WHERE project_id=? AND user_id=?', [project.id, user])) throw new ApiError(409, 'You are already a member of this project.');
      if (store.all('SELECT user_id FROM project_members WHERE project_id=?', [project.id]).length >= 8) throw new ApiError(409, 'This room already has eight members.');
      ownedAvatar(body.avatar_id, user);
      store.run('INSERT INTO project_members (project_id,user_id,avatar_id,avatar_layout_json,joined_at) VALUES (?,?,?,?,?)', [project.id, user, body.avatar_id, JSON.stringify(body.layout), now()]);
    }); res.status(201).json(detail(req.params.id));
  });
  app.put('/api/projects/:id/avatar', (req, res) => {
    const user = userId(req), project = requireMember(req.params.id, user), body = selection.strict().parse(req.body);
    if (project.status === 'archived') throw new ApiError(409, 'This project is read-only.');
    ownedAvatar(body.avatar_id, user);
    store.transaction(() => store.run('UPDATE project_members SET avatar_id=?,avatar_layout_json=? WHERE project_id=? AND user_id=?', [body.avatar_id, JSON.stringify(body.layout), project.id, user])); res.json(detail(project.id));
  });
  app.get('/api/projects/:id/workspace', (req, res) => {
    const user = userId(req), project = requireMember(req.params.id, user);
    if (project.status !== 'archived' && !store.get('SELECT avatar_id FROM project_members WHERE project_id=? AND user_id=? AND avatar_id IS NOT NULL', [req.params.id, user])) throw new ApiError(409, 'Select your project avatar before entering the workspace.');
    res.json(detail(req.params.id));
  });
  app.get('/api/avatars', (req, res) => res.json(store.all<Avatar>('SELECT * FROM avatars WHERE owner_user_id=? ORDER BY created_at', [userId(req)])));
  app.post('/api/avatars/preset', (req, res) => {
    const user = userId(req), body = z.object({ preset: z.enum(PRESETS) }).strict().parse(req.body);
    const imagePath = PRESET_PATHS[body.preset];
    let avatar = store.get<Avatar>('SELECT * FROM avatars WHERE owner_user_id=? AND image_path=?', [user, imagePath]);
    if (!avatar) {
      avatar = { id: randomUUID(), owner_user_id: user, label: body.preset, source_kind: 'preset', image_path: imagePath, created_at: now() };
      store.transaction(() => store.run('INSERT INTO avatars VALUES (?,?,?,?,?,?)', Object.values(avatar!)));
    } res.status(201).json(avatar);
  });
  const upload = multer({ storage: multer.memoryStorage(), defParamCharset: 'utf8', limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 } });
  app.post('/api/avatars/upload', (req, res, next) => { userId(req); next(); }, upload.single('image'), (req, res) => {
    const user = userId(req), file = req.file;
    if (!file || file.mimetype !== 'image/png' || !file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new ApiError(400, 'Choose a valid PNG image (up to 5 MB).');
    if (file.buffer.length < 33 || file.buffer.toString('ascii', 12, 16) !== 'IHDR') throw new ApiError(400, 'This PNG is damaged.');
    const width = file.buffer.readUInt32BE(16), height = file.buffer.readUInt32BE(20);
    if (!width || !height || width > 4096 || height > 4096 || width * height > 12000000) throw new ApiError(400, 'Use a PNG up to 4096px per side and 12 megapixels.');
    try { PNG.sync.read(file.buffer, { checkCRC: true }); } catch { throw new ApiError(400, 'This PNG could not be read. Please choose another image.'); }
    const id = randomUUID(), filename = `${id}.png`, location = path.join(uploads, filename);
    const avatar: Avatar = { id, owner_user_id: user, label: path.basename(file.originalname).slice(0, 120), source_kind: 'uploaded', image_path: `/api/avatars/${id}/image`, created_at: now() };
    writeFileSync(location, file.buffer, { flag: 'wx' });
    try { store.transaction(() => store.run('INSERT INTO avatars VALUES (?,?,?,?,?,?)', Object.values(avatar))); } catch (error) { unlinkSync(location); throw error; }
    res.status(201).json(avatar);
  });
  app.get('/api/avatars/:id/image', (req, res) => {
    const user = userId(req), id = z.string().uuid().parse(req.params.id);
    const avatar = store.get<Avatar>('SELECT * FROM avatars WHERE id=?', [id]);
    if (!avatar || avatar.source_kind !== 'uploaded') throw new ApiError(404, 'Avatar image not found.');
    const shared = store.get('SELECT 1 FROM project_members a JOIN project_members b ON a.project_id=b.project_id WHERE a.avatar_id=? AND b.user_id=?', [id, user]);
    if (avatar.owner_user_id !== user && !shared) throw new ApiError(403, 'This avatar belongs to another local profile.');
    // Restrict serving to a generated filename under this root. In particular,
    // DATA_DIR may legitimately be inside a dot directory such as .qa/.
    res.type('png').sendFile(`${id}.png`, { root: path.resolve(uploads) });
  });
  registerWorkflows(app,store,userId);
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'This API route does not exist.')));
  if (options.serveClient) {
    const client = path.resolve('dist/client'); app.use(express.static(client));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(client, 'index.html')));
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError) return void res.status(error.status).json({ error: error.message });
    if (error instanceof ZodError) return void res.status(400).json({ error: error.issues.map(i => `${i.path.join('.') || 'Input'}: ${i.message}`).join(' · ') });
    if (error instanceof multer.MulterError) return void res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Upload too large: avatars allow 5 MB; evidence and resources allow 20 MB per file.' : 'Too many files or fields in this upload.' });
    if (error instanceof SyntaxError) return void res.status(400).json({ error: 'Invalid JSON request.' });
    const httpError = error as { status?: number };
    if (httpError.status === 413) return void res.status(413).json({ error: 'This request is too large.' });
    if (httpError.status === 404) return void res.status(404).json({ error: 'The saved file could not be found on this computer.' });
    console.error(error); res.status(500).json({ error: 'The local server could not save this change. Please try again.' });
  });
  return app;
}
