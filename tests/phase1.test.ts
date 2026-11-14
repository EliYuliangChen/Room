import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { PNG } from 'pngjs';
import { openStore, type Store } from '../server/src/db.js';
import { createApp } from '../server/src/app.js';
import type { DemoUser, Project, Avatar } from '../shared/types.js';

let directory: string, store: Store, app: ReturnType<typeof createApp>;
const plan = { name: 'Coursework accountability', description: 'An isolated test fixture.', final_due_at: '2027-06-30T23:00:00.000Z', stages: [{title:'Research',tasks:[{title:'Read sources',subtasks:[]},{title:'Literature review',subtasks:[{title:'Find references'},{title:'Summarize findings'}]}]},{title:'Design',tasks:[{title:'Build prototype',subtasks:[]}]}] };
async function user(name='Alex'):Promise<DemoUser>{const response=await request(app).post('/api/demo-users').send({display_name:name});expect(response.status).toBe(201);return response.body;}
async function project(who:DemoUser):Promise<Project>{const response=await request(app).post('/api/projects').set('x-demo-user-id',who.id).send(plan);expect(response.status).toBe(201);return response.body;}
async function preset(who:DemoUser,name='cat'):Promise<Avatar>{const response=await request(app).post('/api/avatars/preset').set('x-demo-user-id',who.id).send({preset:name});expect(response.status).toBe(201);return response.body;}
const layout={scale:1.2,flip:true,offsetX:12};
function png(){const image=new PNG({width:5,height:7});image.data.fill(0);image.data[0]=255;image.data[3]=128;return PNG.sync.write(image);}
async function upload(who:DemoUser,bytes=png()){return request(app).post('/api/avatars/upload').set('x-demo-user-id',who.id).attach('image',bytes,{filename:'avatar.png',contentType:'image/png'});}
beforeEach(async()=>{directory=mkdtempSync(path.join(tmpdir(),'project-room-test-'));store=await openStore(directory);app=createApp(store);});
afterEach(()=>{try{store.close();}catch{/* A restart test may have already closed it. */}if(directory.startsWith(path.join(tmpdir(),'project-room-test-')))rmSync(directory,{recursive:true,force:true});});

describe('Phase 1: empty start, identity and setup',()=>{
  it('creates only schema on clean start and never seeds users, projects, or memberships',async()=>{
    expect((await request(app).get('/api/demo-users')).body).toEqual([]);
    for(const table of ['projects','project_members','avatars','stages','tasks'])expect(store.all(`SELECT * FROM ${table}`)).toEqual([]);
    expect(readFileSync(path.join(directory,'app.sqlite')).subarray(0,16).toString()).toBe('SQLite format 3\0');
    expect(store.get('PRAGMA user_version')).toEqual({user_version:5});
  });
  it('creates local profiles without passwords and switches identity per request',async()=>{
    const a=await user('Alex'),b=await user('Maya');await project(a);
    expect((await request(app).get('/api/projects').set('x-demo-user-id',a.id)).body).toHaveLength(1);
    expect((await request(app).get('/api/projects').set('x-demo-user-id',b.id)).body).toEqual([]);
    expect((await request(app).get('/api/demo-session').set('x-demo-user-id',b.id)).body.display_name).toBe('Maya');
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).post('/api/demo-users').send({display_name:'  '})).status).toBe(400);
  });
  it('persists a multi-stage draft with direct tasks and one-level subtasks across reopen',async()=>{
    const owner=await user(),p=await project(owner);store.close();store=await openStore(directory);app=createApp(store);
    const saved=(await request(app).get(`/api/projects/${p.id}`).set('x-demo-user-id',owner.id)).body;
    expect(saved.status).toBe('draft_setup');expect(saved.stages.map((s:{title:string})=>s.title)).toEqual(['Research','Design']);
    expect(saved.stages[0].tasks[1].subtasks.map((s:{title:string})=>s.title)).toEqual(['Find references','Summarize findings']);
    expect(saved.join_code).toBe(p.join_code);expect(saved.members).toHaveLength(1);expect(saved.members[0].avatar_id).toBeNull();expect(saved.progress).toBe(0);
  });
  it('validates project input atomically and does not allow deeper task nesting',async()=>{
    const owner=await user();
    for(const body of [{...plan,name:''},{...plan,final_due_at:'not-a-date'},{...plan,stages:[]},{...plan,stages:[{title:'Stage',tasks:[{title:'Parent',subtasks:[{title:'Child',subtasks:[{title:'Too deep'}]}]}]}]}])
      expect((await request(app).post('/api/projects').set('x-demo-user-id',owner.id).send(body)).status).toBe(400);
    expect(store.all('SELECT * FROM projects')).toEqual([]);
  });
  it('allows creator draft edits, rejects other identities and committed-plan direct edits',async()=>{
    const owner=await user(),outsider=await user('Not a member'),p=await project(owner);
    expect((await request(app).put(`/api/projects/${p.id}/draft`).set('x-demo-user-id',outsider.id).send(plan)).status).toBe(403);
    const changed={...plan,name:'Revised draft',stages:[{title:'New stage',tasks:[]}]};
    expect((await request(app).put(`/api/projects/${p.id}/draft`).set('x-demo-user-id',owner.id).send(changed)).body.name).toBe('Revised draft');
    expect(store.all('SELECT * FROM tasks')).toHaveLength(0);
    store.transaction(()=>store.run("UPDATE projects SET status='ongoing' WHERE id=?",[p.id]));
    expect((await request(app).put(`/api/projects/${p.id}/draft`).set('x-demo-user-id',owner.id).send(plan)).status).toBe(409);
  });
});
describe('Phase 1: invitations and per-project avatars',()=>{
  it('lets a creator archive a solo draft while preserving the project, avatar and local records',async()=>{
    const owner=await user(),p=await project(owner),avatar=(await upload(owner)).body;
    await request(app).put(`/api/projects/${p.id}/avatar`).set('x-demo-user-id',owner.id).send({avatar_id:avatar.id,layout});
    const stages=store.all('SELECT * FROM stages WHERE project_id=?',[p.id]),tasks=store.all('SELECT * FROM tasks WHERE project_id=?',[p.id]),members=store.all('SELECT * FROM project_members WHERE project_id=?',[p.id]);
    const result=await request(app).post(`/api/projects/${p.id}/archive-draft`).set('x-demo-user-id',owner.id);
    expect(result.status,result.text).toBe(200);expect(result.body).toMatchObject({id:p.id,status:'archived',join_code:p.join_code});expect(result.body.archived_at).toBeTruthy();
    expect(store.all('SELECT * FROM stages WHERE project_id=?',[p.id])).toEqual(stages);
    expect(store.all('SELECT * FROM tasks WHERE project_id=?',[p.id])).toEqual(tasks);
    expect(store.all('SELECT * FROM project_members WHERE project_id=?',[p.id])).toEqual(members);
    expect(store.all('SELECT event_kind FROM activity_events WHERE project_id=?',[p.id])).toEqual([{event_kind:'draft_archived'}]);
    expect((await request(app).get(`${avatar.image_path}?user=${owner.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/projects/${p.id}/workspace`).set('x-demo-user-id',owner.id)).status).toBe(200);
    expect((await request(app).get(`/api/invitations/${p.join_code}`).set('x-demo-user-id',owner.id)).status).toBe(409);
    expect((await request(app).put(`/api/projects/${p.id}/draft`).set('x-demo-user-id',owner.id).send(plan)).status).toBe(409);
    expect((await request(app).post(`/api/projects/${p.id}/chat`).set('x-demo-user-id',owner.id).send({body:'No edits after archive'})).status).toBe(409);
    store.close();store=await openStore(directory);app=createApp(store);
    expect((await request(app).get(`/api/projects/${p.id}`).set('x-demo-user-id',owner.id)).body.status).toBe('archived');
  });
  it('does not let outsiders or joined members archive a draft or bypass the team finish vote',async()=>{
    const owner=await user(),p=await project(owner),other=await user('Other'),avatar=await preset(other);
    expect((await request(app).post(`/api/projects/${p.id}/archive-draft`).set('x-demo-user-id',other.id)).status).toBe(403);
    await request(app).post(`/api/projects/${p.id}/join`).set('x-demo-user-id',other.id).send({code:p.join_code,avatar_id:avatar.id,layout});
    expect((await request(app).post(`/api/projects/${p.id}/archive-draft`).set('x-demo-user-id',other.id)).status).toBe(403);
    expect((await request(app).post(`/api/projects/${p.id}/archive-draft`).set('x-demo-user-id',owner.id)).status).toBe(409);
    expect(store.get('SELECT status FROM projects WHERE id=?',[p.id])).toEqual({status:'draft_setup'});
    const ongoing=await project(owner);store.transaction(()=>store.run("UPDATE projects SET status='ongoing' WHERE id=?",[ongoing.id]));
    expect((await request(app).post(`/api/projects/${ongoing.id}/archive-draft`).set('x-demo-user-id',owner.id)).status).toBe(409);
    expect(store.all('SELECT * FROM activity_events')).toHaveLength(0);
  });
  it('keeps a solo draft readable after archive even if its creator never chose an avatar',async()=>{
    const owner=await user(),p=await project(owner);
    expect((await request(app).get(`/api/projects/${p.id}/workspace`).set('x-demo-user-id',owner.id)).status).toBe(409);
    expect((await request(app).post(`/api/projects/${p.id}/archive-draft`).set('x-demo-user-id',owner.id)).status).toBe(200);
    const workspace=await request(app).get(`/api/projects/${p.id}/workspace`).set('x-demo-user-id',owner.id);
    expect(workspace.status).toBe(200);expect(workspace.body.members[0].avatar_id).toBeNull();
    expect((await request(app).get(`/api/projects/${p.id}/workflow`).set('x-demo-user-id',owner.id)).body.project.status).toBe('archived');
    expect((await request(app).get(`/api/projects/${p.id}/report`).set('x-demo-user-id',owner.id)).status).toBe(200);
  });
  it('requires an avatar before the creator enters the workspace',async()=>{
    const owner=await user(),p=await project(owner);
    expect((await request(app).get(`/api/projects/${p.id}/workspace`).set('x-demo-user-id',owner.id)).status).toBe(409);
    const avatar=await preset(owner);
    expect((await request(app).put(`/api/projects/${p.id}/avatar`).set('x-demo-user-id',owner.id).send({avatar_id:avatar.id,layout})).status).toBe(200);
    const response=await request(app).get(`/api/projects/${p.id}/workspace`).set('x-demo-user-id',owner.id);
    expect(response.status).toBe(200);expect(response.body.members[0].avatar_layout).toEqual(layout);
  });
  it('resolves local codes, joins with chosen avatar, and prevents duplicate membership',async()=>{
    const owner=await user(),p=await project(owner),member=await user('Teammate'),avatar=await preset(member);
    expect((await request(app).get(`/api/invitations/${p.join_code.toLowerCase()}`).set('x-demo-user-id',member.id)).body).toMatchObject({id:p.id,member_count:1,is_member:false});
    expect((await request(app).get(`/api/projects/${p.id}`).set('x-demo-user-id',member.id)).status).toBe(403);
    const join=()=>request(app).post(`/api/projects/${p.id}/join`).set('x-demo-user-id',member.id).send({code:p.join_code,avatar_id:avatar.id,layout});
    expect((await join()).status).toBe(201);expect((await join()).status).toBe(409);
    expect((await request(app).get(`/api/projects/${p.id}/workspace`).set('x-demo-user-id',member.id)).status).toBe(200);
    expect(store.all('SELECT * FROM project_members WHERE project_id=?',[p.id])).toHaveLength(2);
    expect((await request(app).get('/api/invitations/ZZZZZZZZ').set('x-demo-user-id',member.id)).status).toBe(404);
  });
  it('enforces the eight-member cap and does not partially join the ninth profile',async()=>{
    const owner=await user(),p=await project(owner);
    for(let i=2;i<=9;i++){
      const next=await user(`Member ${i}`),avatar=await preset(next);
      const response=await request(app).post(`/api/projects/${p.id}/join`).set('x-demo-user-id',next.id).send({code:p.join_code,avatar_id:avatar.id,layout});
      expect(response.status).toBe(i<=8?201:409);
    }
    expect(store.all('SELECT * FROM project_members WHERE project_id=?',[p.id])).toHaveLength(8);
  });
  it('rejects foreign avatars, wrong codes, malformed layouts and unauthorized draft editing',async()=>{
    const owner=await user(),p=await project(owner),member=await user('Member'),foreign=await preset(owner),own=await preset(member);
    for(const body of [{code:p.join_code,avatar_id:foreign.id,layout},{code:'ZZZZZZZZ',avatar_id:own.id,layout},{code:p.join_code,avatar_id:own.id,layout:{...layout,scale:999}}]){
      expect((await request(app).post(`/api/projects/${p.id}/join`).set('x-demo-user-id',member.id).send(body)).status).toBeGreaterThanOrEqual(400);
    }
    expect(store.all('SELECT * FROM project_members')).toHaveLength(1);
    await request(app).post(`/api/projects/${p.id}/join`).set('x-demo-user-id',member.id).send({code:p.join_code,avatar_id:own.id,layout});
    expect((await request(app).put(`/api/projects/${p.id}/draft`).set('x-demo-user-id',member.id).send(plan)).status).toBe(403);
  });
  it('keeps saved avatars profile-owned and layout independent for each project',async()=>{
    const owner=await user(),a=await project(owner),b=await project(owner),avatar=await preset(owner),other=await user('Other');
    const second=await preset(owner);expect(second.id).toBe(avatar.id);
    await request(app).put(`/api/projects/${a.id}/avatar`).set('x-demo-user-id',owner.id).send({avatar_id:avatar.id,layout});
    await request(app).put(`/api/projects/${b.id}/avatar`).set('x-demo-user-id',owner.id).send({avatar_id:avatar.id,layout:{scale:.8,flip:false,offsetX:-20}});
    const savedA=(await request(app).get(`/api/projects/${a.id}`).set('x-demo-user-id',owner.id)).body;
    expect(savedA.members[0].avatar_layout).toEqual(layout);
    expect((await request(app).get('/api/avatars').set('x-demo-user-id',other.id)).body).toEqual([]);
  });
});
describe('Phase 1: real local uploads, guards and disk durability',()=>{
  it('preserves transparent PNG bytes, metadata and transforms across restart',async()=>{
    const owner=await user(),p=await project(owner),bytes=png(),response=await upload(owner,bytes);expect(response.status).toBe(201);const avatar=response.body;
    await request(app).put(`/api/projects/${p.id}/avatar`).set('x-demo-user-id',owner.id).send({avatar_id:avatar.id,layout});
    store.close();store=await openStore(directory);app=createApp(store);
    const image=await request(app).get(`${avatar.image_path}?user=${owner.id}`);expect(image.status).toBe(200);expect(Buffer.compare(image.body,bytes)).toBe(0);
    expect(PNG.sync.read(image.body).data[3]).toBe(128);
    expect((await request(app).get(`/api/projects/${p.id}/workspace`).set('x-demo-user-id',owner.id)).body.members[0].avatar_layout).toEqual(layout);
  });
  it('serves uploaded avatars when DATA_DIR is inside a hidden directory',async()=>{
    store.close();store=await openStore(path.join(directory,'.hidden-local-data'));app=createApp(store);
    const owner=await user(),bytes=png(),avatar=(await upload(owner,bytes)).body;
    const image=await request(app).get(`${avatar.image_path}?user=${owner.id}`);
    expect(image.status).toBe(200);expect(Buffer.compare(image.body,bytes)).toBe(0);
  });
  it('serves uploaded avatars only to their owner or fellow project members',async()=>{
    const owner=await user(),p=await project(owner),avatar=(await upload(owner)).body,other=await user('Other');
    expect((await request(app).get(`${avatar.image_path}?user=${other.id}`)).status).toBe(403);
    expect((await request(app).get(avatar.image_path)).status).toBe(401);
    await request(app).put(`/api/projects/${p.id}/avatar`).set('x-demo-user-id',owner.id).send({avatar_id:avatar.id,layout});
    const otherAvatar=await preset(other);await request(app).post(`/api/projects/${p.id}/join`).set('x-demo-user-id',other.id).send({code:p.join_code,avatar_id:otherAvatar.id,layout});
    expect((await request(app).get(`${avatar.image_path}?user=${other.id}`)).status).toBe(200);
  });
  it('rejects counterfeit, corrupt, oversize PNG files and unbounded dimensions',async()=>{
    const owner=await user();
    expect((await upload(owner,Buffer.from('<script>bad()</script>'))).status).toBe(400);
    const corrupt=png();corrupt[corrupt.length-5]^=255;expect((await upload(owner,corrupt)).status).toBe(400);
    expect((await upload(owner,Buffer.alloc(5*1024*1024+1))).status).toBe(400);
    const huge=png();huge.writeUInt32BE(100000,16);expect((await upload(owner,huge)).status).toBe(400);
    expect(store.all('SELECT * FROM avatars')).toHaveLength(0);
  });
  it('retains foreign keys after SQLite exports and rolls back failed transactions',async()=>{
    await user(); // runs an export/commit
    expect(()=>store.transaction(()=>store.run('INSERT INTO avatars VALUES (?,?,?,?,?,?)',['bad','missing','bad','preset','bad','now']))).toThrow();
    expect(store.all('SELECT * FROM avatars')).toHaveLength(0);
    expect(()=>store.transaction(()=>{store.run('INSERT INTO demo_users VALUES (?,?,?,?)',['rolled-back','Test',null,'now']);throw new Error('abort');})).toThrow('abort');
    expect(store.get('SELECT * FROM demo_users WHERE id=?',['rolled-back'])).toBeUndefined();
  });
  it('rejects cross-origin browser access and arbitrary file paths',async()=>{
    expect((await request(app).get('/api/demo-users').set('Origin','https://outside.example')).status).toBe(403);
    expect((await request(app).get('/api/demo-users').set('Origin','http://localhost:5173')).status).toBe(200);
    const owner=await user();expect((await request(app).get('/api/avatars/not-a-file/image').set('x-demo-user-id',owner.id)).status).toBe(400);
    expect((await request(app).get('/api/does-not-exist')).status).toBe(404);
  });
  it('refuses a second API store for the same directory',async()=>{await expect(openStore(directory)).rejects.toThrow('already open');});
  it('recovers a stale lock after an interrupted process',async()=>{
    store.close();writeFileSync(path.join(directory,'app.lock'),'2147483647');store=await openStore(directory);expect(store.all('SELECT * FROM projects')).toEqual([]);
  });
});

it('survives an actual Node server process stop and restart with project and image bytes intact',async()=>{
  const childDirectory=path.join(directory,'child');let child:ChildProcess|undefined;
  const port=await new Promise<number>(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const port=(socket.address() as net.AddressInfo).port;socket.close(()=>resolve(port));});});
  const base=`http://127.0.0.1:${port}`;
  async function launch(){child=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{cwd:process.cwd(),env:{...process.env,DATA_DIR:childDirectory,API_PORT:String(port)},stdio:['ignore','pipe','pipe'],windowsHide:true});let logs='';await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(`API startup timed out: ${logs}`)),10000);child!.stdout!.on('data',data=>{logs+=data.toString();if(logs.includes('Project Room API:')){clearTimeout(timeout);resolve();}});child!.stderr!.on('data',data=>{logs+=data.toString();});child!.once('exit',code=>{clearTimeout(timeout);reject(new Error(`API exited: ${code} ${logs}`));});});}
  async function stop(){if(child&&child.exitCode===null){await new Promise<void>(resolve=>{child!.once('exit',()=>resolve());child!.kill();});}}
  try{
    await launch();const owner=await (await fetch(`${base}/api/demo-users`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({display_name:'Restart fixture'})})).json() as DemoUser;const headers={'x-demo-user-id':owner.id,'Content-Type':'application/json'};
    const p=await(await fetch(`${base}/api/projects`,{method:'POST',headers,body:JSON.stringify(plan)})).json() as Project;
    const bytes=png(),body=new FormData();body.append('image',new Blob([bytes],{type:'image/png'}),'restart.png');const avatar=await(await fetch(`${base}/api/avatars/upload`,{method:'POST',headers:{'x-demo-user-id':owner.id},body})).json() as Avatar;
    expect(avatar.id).toBeTruthy();await stop();await launch();
    expect((await(await fetch(`${base}/api/projects`,{headers})).json() as Project[])[0].id).toBe(p.id);
    const downloaded=await fetch(`${base}${avatar.image_path}?user=${owner.id}`);expect(downloaded.status).toBe(200);expect(Buffer.compare(Buffer.from(await downloaded.arrayBuffer()),bytes)).toBe(0);
  }finally{await stop();}
});
