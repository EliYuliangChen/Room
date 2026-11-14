import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync,rmSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore,migrations,type Store } from '../server/src/db.js';
import initSqlJs from 'sql.js';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/src/app.js';
import { workflows } from '../server/src/workflow.js';
import { calculateMetrics, leaves } from '../shared/metrics.js';
import type { DemoUser,Project,TaskNode,ChangeRequest,ChangeProposal } from '../shared/types.js';
let directory:string,store:Store,app:ReturnType<typeof createApp>;
const deadline='2027-06-01T12:00:00.000Z';
beforeEach(async()=>{directory=mkdtempSync(path.join(tmpdir(),'project-room-phase2-'));store=await openStore(directory);app=createApp(store);});
afterEach(()=>{vi.useRealTimers();try{store.close();}catch{}if(directory.startsWith(path.join(tmpdir(),'project-room-phase2-')))rmSync(directory,{recursive:true,force:true});});
const call=(method:'get'|'post'|'put'|'patch'|'delete',url:string,user:DemoUser)=>request(app)[method](url).set('x-demo-user-id',user.id);
async function room(n=4,tasks=2,finalize=true){
  const users:DemoUser[]=[];for(let i=0;i<n;i++)users.push((await request(app).post('/api/demo-users').send({display_name:`Student ${i+1}`})).body);
  let p:Project=(await call('post','/api/projects',users[0]).send({name:'Phase 2 fixture',description:'Isolated fixture',final_due_at:'2027-07-01T12:00:00.000Z',stages:[{title:'Parallel work',tasks:Array.from({length:tasks},(_,i)=>({title:`Work ${i+1}`,subtasks:[]}))}]})).body;
  for(let i=0;i<n;i++){const avatar=(await call('post','/api/avatars/preset',users[i]).send({preset:'cat'})).body;const selected={avatar_id:avatar.id,layout:{scale:1,flip:false,offsetX:0}};if(i===0)await call('put',`/api/projects/${p.id}/avatar`,users[i]).send(selected);else expect((await call('post',`/api/projects/${p.id}/join`,users[i]).send({...selected,code:p.join_code})).status).toBe(201);}
  if(finalize){for(const [index,t]of leaves(p.stages.flatMap(s=>s.tasks)).entries())expect((await call('post',`/api/projects/${p.id}/draft-change`,users[0]).send({type:'task_update',task_id:t.id,assignee_user_id:users[index%n].id,due_at:deadline})).status).toBe(200);expect((await call('post',`/api/projects/${p.id}/finalize`,users[0])).status).toBe(200);}
  p=(await call('get',`/api/projects/${p.id}`,users[0])).body;return {p,users,tasks:leaves(p.stages.flatMap(s=>s.tasks))};
}
async function submit(t:TaskNode,user:DemoUser,text='Evidence'){const response=await call('post',`/api/leaf-tasks/${t.id}/submissions`,user).send({text});expect(response.status).toBe(201);return response.body as TaskNode;}
async function proposal(p:Project,user:DemoUser,change:ChangeProposal){const r=await call('post',`/api/projects/${p.id}/requests`,user).send({proposal:change,reason:'Discussed with the team.'});expect(r.status,r.text).toBe(201);return r.body as ChangeRequest;}
async function approve(r:ChangeRequest,users:DemoUser[]){for(const u of users){if(r.status!=='pending')break;if(!r.votes.some(v=>v.voter_id===u.id)&&r.votes.filter(v=>v.decision==='approve').length<r.threshold)r=(await call('post',`/api/requests/${r.id}/votes`,u).send({decision:'approve'})).body;}
  for(const c of r.consents){if(c.status==='pending')r=(await call('post',`/api/requests/${r.id}/consents`,users.find(u=>u.id===c.target_user_id)!).send({accept:true})).body;}return r;}

describe('Existing database Workspace entry',()=>{
  it('upgrades a version-4 database missing the submission cursor and saves draft responsibility assignments',async()=>{
    const {p,users,tasks}=await room(2,2,false);
    store.transaction(()=>{store.run('ALTER TABLE tasks DROP COLUMN active_submission_from');store.run('PRAGMA user_version=4');});
    store.close();store=await openStore(directory);app=createApp(store);
    const response=await call('post',`/api/projects/${p.id}/draft-change`,users[0]).send({type:'task_update',task_id:tasks[0].id,assignee_user_id:users[1].id,due_at:deadline});
    expect(response.status,response.text).toBe(200);
    expect(response.body.stages[0].tasks[0]).toMatchObject({id:tasks[0].id,title:tasks[0].title,assignee_user_id:users[1].id,due_at:deadline,active_submission_from:1});
    expect(response.body.stages[0].tasks[1]).toMatchObject({id:tasks[1].id,assignee_user_id:null,due_at:null});
    expect(response.body.members.map((m:{avatar_id:string})=>m.avatar_id)).toEqual(p.members.map(m=>m.avatar_id));
    expect(store.get('PRAGMA user_version')).toEqual({user_version:5});
    store.close();store=await openStore(directory);app=createApp(store);
    expect((await call('get',`/api/projects/${p.id}/workflow`,users[0])).body.project.stages[0].tasks[0].assignee_user_id).toBe(users[1].id);
  });
  it('retains existing submission cursors when upgrading the other version-4 schema',async()=>{
    const {p,tasks}=await room(2,1,false);
    store.transaction(()=>{store.run('UPDATE tasks SET active_submission_from=7 WHERE id=?',[tasks[0].id]);store.run('PRAGMA user_version=4');});
    store.close();store=await openStore(directory);app=createApp(store);
    expect(store.get('SELECT active_submission_from FROM tasks WHERE id=?',[tasks[0].id])).toEqual({active_submission_from:7});
    expect(store.get('SELECT id FROM projects WHERE id=?',[p.id])).toEqual({id:p.id});
    expect(store.get('PRAGMA user_version')).toEqual({user_version:5});
  });
  it('upgrades a version-3 database missing chat_read_seq without losing projects, avatars or read receipts',async()=>{
    const {p,users}=await room(2,1,false);
    const readAt='2026-10-27T12:00:00.000Z';
    store.transaction(()=>{
      store.run('INSERT INTO chat_messages VALUES (?,?,?,?,?)',[randomUUID(),p.id,users[1].id,'Already read','2026-10-27T11:00:00.000Z']);
      store.run('INSERT INTO chat_messages VALUES (?,?,?,?,?)',[randomUUID(),p.id,users[1].id,'Still unread','2026-10-27T13:00:00.000Z']);
      store.run('UPDATE project_members SET chat_read_at=? WHERE project_id=? AND user_id=?',[readAt,p.id,users[0].id]);
      store.run('ALTER TABLE project_members DROP COLUMN chat_read_seq');
      store.run('PRAGMA user_version=3');
    });
    store.close();store=await openStore(directory);app=createApp(store);
    const response=await call('get',`/api/projects/${p.id}/workflow`,users[0]);
    expect(response.status,response.text).toBe(200);
    expect(response.body.project).toMatchObject({...p,members:p.members.map(({user_id,avatar_id,image_path,avatar_layout})=>({user_id,avatar_id,image_path,avatar_layout}))});
    expect(response.body.chat_unread).toBe(1);
    expect(store.get('PRAGMA user_version')).toEqual({user_version:5});
    expect((await call('get',`/api/projects/${p.id}/workspace`,users[0])).status).toBe(200);
    store.close();store=await openStore(directory);app=createApp(store);
    expect((await call('get',`/api/projects/${p.id}/workflow`,users[0])).body.chat_unread).toBe(1);
  });
  it('keeps existing sequence receipts when upgrading a version-3 database that already has the column',async()=>{
    const {p,users}=await room(2,1,false);
    store.transaction(()=>{
      store.run('INSERT INTO chat_messages VALUES (?,?,?,?,?)',[randomUUID(),p.id,users[1].id,'Read message','2026-10-27T12:00:00.000Z']);
      store.run('UPDATE project_members SET chat_read_seq=1 WHERE project_id=? AND user_id=?',[p.id,users[0].id]);
      store.run('PRAGMA user_version=3');
    });
    store.close();store=await openStore(directory);app=createApp(store);
    const response=await call('get',`/api/projects/${p.id}/workflow`,users[0]);
    expect(response.status,response.text).toBe(200);expect(response.body.chat_unread).toBe(0);
    expect(store.get('SELECT chat_read_seq FROM project_members WHERE project_id=? AND user_id=?',[p.id,users[0].id])).toEqual({chat_read_seq:1});
    expect(store.get('PRAGMA user_version')).toEqual({user_version:5});
  });
});

describe('Initial plan and leaf ownership',()=>{
  it('requires two members, actual leaves, owner and DDL; creator confirms without per-member Accept',async()=>{
    const {p,users,tasks}=await room(2,2,false);
    expect((await call('post',`/api/projects/${p.id}/finalize`,users[0])).status).toBe(400);
    for(const t of tasks)await call('post',`/api/projects/${p.id}/draft-change`,users[0]).send({type:'task_update',task_id:t.id,assignee_user_id:users[0].id,due_at:deadline});
    expect((await call('post',`/api/projects/${p.id}/finalize`,users[1])).status).toBe(403);
    expect((await call('post',`/api/projects/${p.id}/finalize`,users[0])).body.status).toBe('ongoing');
    expect((await call('post',`/api/projects/${p.id}/draft-change`,users[0]).send({type:'task_update',task_id:tasks[0].id,title:'Silent edit'})).status).toBe(403);
    expect((await call('put',`/api/projects/${p.id}/draft`,users[0]).send({})).status).toBe(400);
  });
  it('blocks one-member and empty initial plans',async()=>{const a=await room(1,1,false);await call('post',`/api/projects/${a.p.id}/draft-change`,a.users[0]).send({type:'task_update',task_id:a.tasks[0].id,assignee_user_id:a.users[0].id,due_at:deadline});expect((await call('post',`/api/projects/${a.p.id}/finalize`,a.users[0])).status).toBe(400);const b=await room(2,0,false);expect((await call('post',`/api/projects/${b.p.id}/finalize`,b.users[0])).status).toBe(400);});
  it('enforces a single member owner, rejects deeper hierarchy and grouping-parent ownership',async()=>{
    const {p,users,tasks}=await room(2,1,false);
    expect((await call('post',`/api/projects/${p.id}/draft-change`,users[0]).send({type:'task_update',task_id:tasks[0].id,assignee_user_id:[users[0].id,users[1].id]})).status).toBe(400);
    const split=await call('post',`/api/projects/${p.id}/draft-change`,users[0]).send({type:'task_split',task_id:tasks[0].id,children:[{title:'Leaf A',assignee_user_id:users[0].id,due_at:deadline},{title:'Leaf B',assignee_user_id:users[1].id,due_at:deadline}]});expect(split.status).toBe(200);
    const group=split.body.stages[0].tasks[0];expect(group.assignee_user_id).toBeNull();expect(group.subtasks).toHaveLength(2);
    expect((await call('post',`/api/projects/${p.id}/draft-change`,users[0]).send({type:'task_update',task_id:group.id,assignee_user_id:users[0].id})).status).toBe(400);
    expect((await call('post',`/api/projects/${p.id}/draft-change`,users[0]).send({type:'task_split',task_id:group.subtasks[0].id,children:[{title:'Too deep',assignee_user_id:users[0].id,due_at:deadline}]})).status).toBe(400);
    expect((await call('post',`/api/projects/${p.id}/finalize`,users[0])).status).toBe(200);
    expect((await call('get',`/api/projects/${p.id}`,users[0])).body.metrics.map((m:{assigned:number})=>m.assigned)).toEqual([1,1]);
  });
});
describe('Versioned submission review',()=>{
  it('requires meaningful evidence, validates links and restricts author to the assigned member',async()=>{
    const {users,tasks}=await room();
    expect((await call('post',`/api/leaf-tasks/${tasks[0].id}/submissions`,users[0]).send({text:'   '})).status).toBe(400);
    expect((await call('post',`/api/leaf-tasks/${tasks[0].id}/submissions`,users[1]).send({text:'Not mine'})).status).toBe(403);
    expect((await call('post',`/api/leaf-tasks/${tasks[0].id}/submissions`,users[0]).send({links:['javascript:alert(1)']})).status).toBe(400);
    expect((await call('post',`/api/leaf-tasks/${tasks[0].id}/submissions`,users[0]).send({links:['not a url']})).status).toBe(400);
    const result=await call('post',`/api/leaf-tasks/${tasks[0].id}/submissions`,users[0]).send({links:['https://example.edu/evidence']});expect(result.status).toBe(201);expect(result.body.submissions[0].links).toEqual(['https://example.edu/evidence']);
  });
  it('in a four-person group two of three reviewers approve despite one dissent',async()=>{
    const {p,users,tasks}=await room();const submitted=await submit(tasks[0],users[0]),s=submitted.submissions[0];
    expect((await call('post',`/api/submissions/${s.id}/votes`,users[0]).send({decision:'approve'})).status).toBe(403);
    expect((await call('post',`/api/submissions/${s.id}/votes`,users[1]).send({decision:'request_changes'})).status).toBe(400);
    await call('post',`/api/submissions/${s.id}/votes`,users[1]).send({decision:'request_changes',note:'Please check references.'});
    const first=await call('post',`/api/submissions/${s.id}/votes`,users[2]).send({decision:'approve'});expect(first.body.status).toBe('pending_review');
    const second=await call('post',`/api/submissions/${s.id}/votes`,users[3]).send({decision:'approve'});expect(second.body.status).toBe('completed');expect(second.body.submissions[0].votes).toHaveLength(3);
    expect((await call('get',`/api/projects/${p.id}`,users[0])).body.metrics[0].completed).toBe(1);
    expect((await call('post',`/api/submissions/${s.id}/votes`,users[1]).send({decision:'approve'})).status).toBe(409);
  });
  it('mathematically rejects a round, keeps old votes and starts a clean resubmission version',async()=>{
    const {p,users,tasks}=await room();const v1=(await submit(tasks[0],users[0])).submissions[0];
    const announcements=store.all('SELECT * FROM announcements WHERE project_id=?',[p.id]);
    expect((await call('post',`/api/leaf-tasks/${tasks[0].id}/submissions`,users[0]).send({text:'Early replacement'})).status).toBe(409);
    await call('post',`/api/submissions/${v1.id}/votes`,users[1]).send({decision:'request_changes',note:'A'});
    expect(store.all("SELECT * FROM notifications WHERE kind='review_result'")).toHaveLength(0);
    expect((await call('post',`/api/submissions/${v1.id}/votes`,users[1]).send({decision:'approve'})).status).toBe(409);
    expect((await call('post',`/api/submissions/${v1.id}/votes`,users[2]).send({decision:'request_changes',note:'B'})).body.status).toBe('changes_requested');
    expect(store.all("SELECT user_id,entity_id,text,read_at FROM notifications WHERE kind='review_result'")).toEqual([{user_id:users[0].id,entity_id:v1.id,text:`${tasks[0].title}: changes requested.`,read_at:null}]);
    expect(store.all('SELECT * FROM announcements WHERE project_id=?',[p.id])).toEqual(announcements);
    const t=await submit(tasks[0],users[0],'Revised evidence');expect(t.submissions).toHaveLength(2);expect(t.submissions[0].version_no).toBe(2);expect(t.submissions[0].votes).toEqual([]);expect(t.submissions[1].votes).toHaveLength(2);
    await call('post',`/api/submissions/${t.submissions[0].id}/votes`,users[1]).send({decision:'approve'});
    expect((await call('post',`/api/submissions/${t.submissions[0].id}/votes`,users[2]).send({decision:'approve'})).body.status).toBe('completed');
  });
  it('classifies on-time by the accepted version submission time, not the approval time',async()=>{
    const {p,users,tasks}=await room(2,1);vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2027-06-01T11:00:00Z'));
    const before=(await submit(tasks[0],users[0])).submissions[0];vi.setSystemTime(new Date('2027-06-02T12:00:00Z'));
    await call('post',`/api/submissions/${before.id}/votes`,users[1]).send({decision:'approve'});expect((await call('get',`/api/projects/${p.id}`,users[0])).body.metrics[0].on_time_rate).toBe(100);
    const replacement=(await submit(tasks[0],users[0],'Transparent new version')).submissions[0];await call('post',`/api/submissions/${replacement.id}/votes`,users[1]).send({decision:'approve'});
    expect((await call('get',`/api/projects/${p.id}`,users[0])).body.metrics[0].on_time_rate).toBe(0);
  });
  it('stores evidence files locally and downloads exactly the original bytes after reopen',async()=>{
    const {users,tasks}=await room(2,1),bytes=Buffer.from('%PDF-1.4\nLocal evidence\n%%EOF');
    const result=await call('post',`/api/leaf-tasks/${tasks[0].id}/submissions`,users[0]).field('description','File-only evidence').attach('files',bytes,{filename:'evidence.pdf',contentType:'application/pdf'});expect(result.status,result.text).toBe(201);
    const id=result.body.submissions[0].files[0].id;store.close();store=await openStore(directory);app=createApp(store);
    const file=await call('get',`/api/files/${id}/download`,users[1]);expect(file.status).toBe(200);expect(file.body).toEqual(bytes);expect(file.headers['content-disposition']).toContain('attachment');
  });
});
describe('Requests, consent and transparent canonical changes',()=>{
  it('auto-votes once for the proposer, needs 3/4 Yes, then requires creator application and announcement',async()=>{
    const {p,users,tasks}=await room();const r=await proposal(p,users[1],{type:'task_update',task_id:tasks[0].id,due_at:'2027-06-04T12:00:00.000Z'});
    expect(r.votes).toHaveLength(1);expect(r.threshold).toBe(3);
    expect((await call('post',`/api/requests/${r.id}/apply`,users[0])).status).toBe(409);
    expect((await call('post',`/api/requests/${r.id}/votes`,users[0]).send({decision:'approve'})).body.status).toBe('pending');
    expect((await call('post',`/api/requests/${r.id}/votes`,users[2]).send({decision:'approve'})).body.status).toBe('approved_waiting_for_creator');
    expect((await call('get',`/api/projects/${p.id}`,users[0])).body.stages[0].tasks[0].due_at).toBe(deadline);
    expect((await call('post',`/api/requests/${r.id}/apply`,users[1])).status).toBe(403);
    expect((await call('post',`/api/requests/${r.id}/apply`,users[0])).body.stages[0].tasks[0].due_at).toBe('2027-06-04T12:00:00.000Z');
    const snapshot=(await call('get',`/api/projects/${p.id}/workflow`,users[3])).body;expect(snapshot.announcements[0].message).toContain('approved and applied');expect(snapshot.activity.some((e:{event_kind:string})=>e.event_kind==='change_applied')).toBe(true);
  });
  it('requires targeted acceptance in addition to majority for reassignment and keeps old evidence historical',async()=>{
    const {p,users,tasks}=await room();const old=(await submit(tasks[0],users[0])).submissions[0];
    const r=await proposal(p,users[0],{type:'task_update',task_id:tasks[0].id,assignee_user_id:users[3].id});
    expect(r.consents[0].target_user_id).toBe(users[3].id);await call('post',`/api/requests/${r.id}/votes`,users[1]).send({decision:'approve'});
    expect((await call('post',`/api/requests/${r.id}/votes`,users[2]).send({decision:'approve'})).body.status).toBe('pending');
    expect((await call('post',`/api/requests/${r.id}/consents`,users[1]).send({accept:true})).status).toBe(403);
    expect((await call('post',`/api/requests/${r.id}/consents`,users[3]).send({accept:true})).body.status).toBe('approved_waiting_for_creator');
    const changed=(await call('post',`/api/requests/${r.id}/apply`,users[0])).body.stages[0].tasks[0];expect(changed.assignee_user_id).toBe(users[3].id);expect(changed.status).toBe('to_do');expect(changed.submissions).toHaveLength(1);
    expect((await call('post',`/api/submissions/${old.id}/votes`,users[1]).send({decision:'approve'})).status).toBe(409);
    const v2=await submit(changed,users[3]);expect(v2.submissions[0].version_no).toBe(2);
  });
  it('rejects impossible majorities and consent refusals, and allows withdrawal without expiration',async()=>{
    const {p,users,tasks}=await room();const a=await proposal(p,users[0],{type:'project_update',name:'Candidate'});
    await call('post',`/api/requests/${a.id}/votes`,users[1]).send({decision:'reject'});expect((await call('post',`/api/requests/${a.id}/votes`,users[2]).send({decision:'reject'})).body.status).toBe('rejected');
    const b=await proposal(p,users[0],{type:'task_update',task_id:tasks[0].id,assignee_user_id:users[1].id});expect((await call('post',`/api/requests/${b.id}/consents`,users[1]).send({accept:false})).body.status).toBe('rejected');
    const c=await proposal(p,users[0],{type:'project_update',description:'Awaiting votes'});vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2030-01-01'));
    expect((await call('get',`/api/projects/${p.id}/workflow`,users[0])).body.requests.find((r:ChangeRequest)=>r.id===c.id).status).toBe('pending');
    expect((await call('post',`/api/requests/${c.id}/withdraw`,users[0])).status).toBe(200);
  });
  it('prevents stale approved requests from overwriting a newer canonical target',async()=>{
    const {p,users,tasks}=await room();const a=await approve(await proposal(p,users[0],{type:'task_update',task_id:tasks[0].id,title:'First change'}),users),b=await approve(await proposal(p,users[0],{type:'task_update',task_id:tasks[0].id,title:'Second change'}),users);
    expect((await call('post',`/api/requests/${a.id}/apply`,users[0])).status).toBe(200);expect((await call('post',`/api/requests/${b.id}/apply`,users[0])).status).toBe(409);
  });
  it('preserves formal history through an approved task split and merge without double counting',async()=>{
    const {p,users,tasks}=await room(2,1);const original=await submit(tasks[0],users[0]);await call('post',`/api/submissions/${original.submissions[0].id}/votes`,users[1]).send({decision:'approve'});
    const split=await approve(await proposal(p,users[0],{type:'task_split',task_id:tasks[0].id,children:[{title:'Piece A',assignee_user_id:users[0].id,due_at:deadline},{title:'Piece B',assignee_user_id:users[1].id,due_at:deadline}]}),users);
    const after=(await call('post',`/api/requests/${split.id}/apply`,users[0])).body as Project;expect(after.metrics.map(m=>m.assigned)).toEqual([1,1]);expect(after.progress).toBe(0);
    const snapshot=(await call('get',`/api/projects/${p.id}/workflow`,users[0])).body;expect(snapshot.history.find((t:TaskNode)=>t.id===tasks[0].id).submissions).toHaveLength(1);
    const group=after.stages[0].tasks[0];const merge=await approve(await proposal(after,users[0],{type:'task_merge',task_id:group.id,title:'Recombined',assignee_user_id:users[1].id,due_at:deadline}),users);
    const merged=(await call('post',`/api/requests/${merge.id}/apply`,users[0])).body;expect(merged.stages[0].tasks[0].subtasks).toHaveLength(0);expect(merged.metrics.map((m:{assigned:number})=>m.assigned)).toEqual([0,1]);
  });
});
describe('Shared arithmetic, resources, chat, notifications and archive',()=>{
  it('notifies each newly committed subtask owner with its actual leaf ID after a split',async()=>{
    const {p,users,tasks}=await room(2,1);const r=await approve(await proposal(p,users[0],{type:'task_split',task_id:tasks[0].id,children:[{title:'First child',assignee_user_id:users[0].id,due_at:deadline},{title:'Second child',assignee_user_id:users[1].id,due_at:deadline}]}),users);
    const view=(await call('post',`/api/requests/${r.id}/apply`,users[0])).body as Project;const children=view.stages[0].tasks[0].subtasks;expect(children.map(t=>t.title)).toEqual(['First child','Second child']);
    for(let i=0;i<2;i++)expect((await call('get','/api/notifications',users[i])).body.some((n:{kind:string;entity_id:string})=>n.kind==='assignment'&&n.entity_id===children[i].id)).toBe(true);
  });
  it('keeps closed review and change thresholds stable when another member later joins',async()=>{
    const {p,users,tasks}=await room(2,1);const s=(await submit(tasks[0],users[0])).submissions[0];await call('post',`/api/submissions/${s.id}/votes`,users[1]).send({decision:'approve'});
    const r=await approve(await proposal(p,users[0],{type:'project_update',description:'Approved with two members'}),users);
    const newcomer=(await request(app).post('/api/demo-users').send({display_name:'Later member'})).body as DemoUser;const avatar=(await call('post','/api/avatars/preset',newcomer).send({preset:'cat'})).body;
    await call('post',`/api/projects/${p.id}/join`,newcomer).send({code:p.join_code,avatar_id:avatar.id,layout:{scale:1,flip:false,offsetX:0}});
    const snapshot=(await call('get',`/api/projects/${p.id}/workflow`,newcomer)).body;expect(snapshot.project.stages[0].tasks[0].submissions[0].threshold).toBe(1);expect(snapshot.requests.find((v:ChangeRequest)=>v.id===r.id).threshold).toBe(2);
    expect((await call('post',`/api/submissions/${s.id}/votes`,newcomer).send({decision:'request_changes',note:'Too late'})).status).toBe(409);
  });
  it('upgrades an actual version-1 SQLite file while preserving profile, project and task IDs',async()=>{
    store.close();const SQL=await initSqlJs(),old=new SQL.Database(),owner=randomUUID(),p=randomUUID(),stage=randomUUID(),task=randomUUID();old.run(migrations[0]);old.run('PRAGMA user_version=1');
    old.run('INSERT INTO demo_users VALUES (?,?,?,?)',[owner,'Existing profile',null,deadline]);
    old.run('INSERT INTO projects (id,name,description,final_due_at,creator_id,status,join_code,thumbnail_variant,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[p,'Existing coursework','Keep my data',deadline,owner,'draft_setup','ABCD2345',2,deadline]);
    old.run('INSERT INTO project_members (project_id,user_id,joined_at) VALUES (?,?,?)',[p,owner,deadline]);old.run('INSERT INTO stages VALUES (?,?,?,?)',[stage,p,'Existing stage',0]);old.run('INSERT INTO tasks (id,project_id,stage_id,title,sort_order,created_at) VALUES (?,?,?,?,?,?)',[task,p,stage,'Existing task',0,deadline]);
    writeFileSync(path.join(directory,'app.sqlite'),old.export());old.close();store=await openStore(directory);app=createApp(store);
    const saved=(await call('get',`/api/projects/${p}`,{id:owner} as DemoUser)).body;expect(saved.name).toBe('Existing coursework');expect(saved.stages[0].tasks[0].id).toBe(task);expect(saved.members[0].user_id).toBe(owner);expect(store.get('PRAGMA user_version')).toEqual({user_version:5});expect(store.all('SELECT * FROM submissions')).toEqual([]);
  });
  it('does not automatically archive even when every member reaches 100%',async()=>{
    const {p,users,tasks}=await room(2,2);for(let i=0;i<2;i++){const s=(await submit(tasks[i],users[i])).submissions[0];await call('post',`/api/submissions/${s.id}/votes`,users[1-i]).send({decision:'approve'});}
    const view=(await call('get',`/api/projects/${p.id}`,users[0])).body;expect(view.progress).toBe(100);expect(view.status).toBe('ongoing');
  });
  it('uses a sequence read receipt so chat messages in the same millisecond are not lost',async()=>{
    const {p,users}=await room(2,1);vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2027-05-01T12:00:00Z'));
    await call('post',`/api/projects/${p.id}/chat`,users[0]).send({body:'First'});await call('post',`/api/projects/${p.id}/chat/read`,users[1]);await call('post',`/api/projects/${p.id}/chat`,users[0]).send({body:'Same-millisecond second'});
    expect((await call('get',`/api/projects/${p.id}/workflow`,users[1])).body.chat_unread).toBe(1);
  });
  it('adds, renames and retires stages and tasks through approved requests while preserving resources',async()=>{
    const {p,users}=await room(2,1);const add=await approve(await proposal(p,users[0],{type:'stage_add',title:'Extra stage'}),users);let view=(await call('post',`/api/requests/${add.id}/apply`,users[0])).body as Project;
    const stage=view.stages.find(s=>s.title==='Extra stage')!;const taskRequest=await approve(await proposal(view,users[0],{type:'task_add',stage_id:stage.id,title:'New scope',description:'Agreed scope',assignee_user_id:users[1].id,due_at:deadline}),users);
    view=(await call('post',`/api/requests/${taskRequest.id}/apply`,users[0])).body;expect(view.stages.find(s=>s.id===stage.id)!.tasks[0].assignee_user_id).toBe(users[1].id);
    const note=await call('post',`/api/projects/${p.id}/resources`,users[0]).send({stage_id:stage.id,kind:'note',title:'Preserve this',body:'Historical context'});expect(note.status).toBe(201);
    const rename=await approve(await proposal(view,users[0],{type:'stage_update',stage_id:stage.id,title:'Renamed stage'}),users);await call('post',`/api/requests/${rename.id}/apply`,users[0]);
    const remove=await approve(await proposal(view,users[0],{type:'stage_remove',stage_id:stage.id}),users);view=(await call('post',`/api/requests/${remove.id}/apply`,users[0])).body;expect(view.stages).toHaveLength(1);expect((await call('get',`/api/projects/${p.id}/resources`,users[1])).body[0].title).toBe('Preserve this');expect((await call('get',`/api/projects/${p.id}/workflow`,users[0])).body.history.some((t:TaskNode)=>t.title==='New scope')).toBe(true);
  });
  it('routes a fresh unassigned-work offer to its target without irrelevant team votes',async()=>{
    const {p,users,tasks}=await room(4,1);store.transaction(()=>store.run('UPDATE tasks SET assignee_user_id=NULL WHERE id=?',[tasks[0].id])); // Isolated legacy-plan edge fixture.
    const r=await proposal(p,users[0],{type:'task_update',task_id:tasks[0].id,assignee_user_id:users[2].id});expect(r.threshold).toBe(1);
    expect((await call('post',`/api/requests/${r.id}/votes`,users[1]).send({decision:'reject'})).status).toBe(403);
    const notices=(await call('get','/api/notifications',users[2])).body;expect(notices.some((n:{kind:string;entity_id:string})=>n.kind==='consent'&&n.entity_id===r.id)).toBe(true);
    expect((await call('post',`/api/requests/${r.id}/consents`,users[2]).send({accept:true})).body.status).toBe('approved_waiting_for_creator');expect((await call('post',`/api/requests/${r.id}/apply`,users[0])).body.unassigned).toBe(0);
  });
  it('protects evidence downloads from outsiders and keeps shared files readable after archive',async()=>{
    const {p,users,tasks}=await room(2,1);const outsider=(await request(app).post('/api/demo-users').send({display_name:'Outside'})).body as DemoUser;
    const evidence=await call('post',`/api/leaf-tasks/${tasks[0].id}/submissions`,users[0]).attach('files',Buffer.from('Formal bytes'),{filename:'formal.txt',contentType:'text/plain'});const evidenceId=evidence.body.submissions[0].files[0].id;
    const resource=await call('post',`/api/projects/${p.id}/resources`,users[0]).field('stage_id',p.stages[0].id).field('kind','file').field('title','Shared bytes').attach('file',Buffer.from('Library bytes'),{filename:'library.txt',contentType:'text/plain'});const resourceId=resource.body.id;
    for(const id of [evidenceId,resourceId])expect((await call('get',`/api/files/${id}/download`,outsider)).status).toBe(403);
    const finish=await proposal(p,users[0],{type:'finish'});await call('post',`/api/requests/${finish.id}/votes`,users[1]).send({decision:'approve'});store.close();store=await openStore(directory);app=createApp(store);
    expect((await call('get',`/api/files/${evidenceId}/download`,users[1])).text).toBe('Formal bytes');expect((await call('get',`/api/files/${resourceId}/download`,users[1])).text).toBe('Library bytes');
    expect((await call('patch',`/api/resources/${resourceId}`,users[0]).send({title:'Edit',body:''})).status).toBe(409);expect((await call('delete',`/api/resources/${resourceId}`,users[0])).status).toBe(409);
    expect((await call('put',`/api/projects/${p.id}/avatar`,users[0]).send({avatar_id:p.members[0].avatar_id,layout:{scale:1,flip:false,offsetX:0}})).status).toBe(409);
    expect((await call('post',`/api/projects/${p.id}/draft-change`,users[0]).send({type:'stage_add',title:'No'})).status).toBe(409);
  });
  it('rejects unsafe evidence file types and leaves no metadata behind after a failed upload',async()=>{
    const {p,users,tasks}=await room(2,1);
    expect((await call('post',`/api/leaf-tasks/${tasks[0].id}/submissions`,users[0]).attach('files',Buffer.from('<script>unsafe()</script>'),{filename:'page.html',contentType:'text/html'})).status).toBe(400);
    expect(store.all('SELECT * FROM submissions')).toHaveLength(0);expect(store.all('SELECT * FROM submission_files')).toHaveLength(0);expect((await call('get',`/api/projects/${p.id}`,users[0])).body.progress).toBe(0);
  });
  it('calculates the exact 37.5% equal-member example and includes zero-task members at 0%',()=>{
    const units=[...Array.from({length:8},(_,i)=>({assignee_user_id:'A',status:i<2?'completed':'to_do',due_at:deadline,accepted_submitted_at:deadline})),...Array.from({length:4},(_,i)=>({assignee_user_id:'B',status:i<2?'completed':'to_do',due_at:deadline,accepted_submitted_at:deadline}))] as TaskNode[];
    const result=calculateMetrics([{user_id:'A',display_name:'A'},{user_id:'B',display_name:'B'}],units);expect(result.progress).toBe(37.5);expect(result.metrics.map(m=>m.percentage)).toEqual([25,50]);
    expect(calculateMetrics([{user_id:'A',display_name:'A'},{user_id:'B',display_name:'B'},{user_id:'C',display_name:'C'}],units).progress).toBe(25);
  });
  it('uses the shared result in actual API and copyable report, with N/A on-time for zero completions',async()=>{
    const {p,users,tasks}=await room(2,12,false);
    for(let i=0;i<12;i++)await call('post',`/api/projects/${p.id}/draft-change`,users[0]).send({type:'task_update',task_id:tasks[i].id,assignee_user_id:users[i<8?0:1].id,due_at:deadline});
    await call('post',`/api/projects/${p.id}/finalize`,users[0]);
    for(const index of [0,1,8,9]){const owner=users[index<8?0:1],reviewer=users[index<8?1:0],s=(await submit(tasks[index],owner)).submissions[0];await call('post',`/api/submissions/${s.id}/votes`,reviewer).send({decision:'approve'});}
    expect((await call('get',`/api/projects/${p.id}`,users[0])).body.progress).toBe(37.5);expect((await call('get',`/api/projects/${p.id}/report`,users[0])).body.text).toContain('37.5%');
    const other=await room(2,1);expect((await call('get',`/api/projects/${other.p.id}/report`,other.users[0])).body.text).toContain('On-time: N/A');
  });
  it('keeps shared files/links/notes separate from completion, supports edit/delete and byte downloads',async()=>{
    const {p,users}=await room(2,1),stage=p.stages[0].id;
    const file=await call('post',`/api/projects/${p.id}/resources`,users[0]).field('stage_id',stage).field('kind','file').field('title','Reference').attach('file',Buffer.from('Reference bytes'),{filename:'reference.txt',contentType:'text/plain'});expect(file.status,file.text).toBe(201);
    const bytes=await call('get',`/api/files/${file.body.id}/download`,users[1]);expect(bytes.status).toBe(200);expect(bytes.text).toBe('Reference bytes');
    const note=await call('post',`/api/projects/${p.id}/resources`,users[1]).send({stage_id:stage,kind:'note',title:'Note',body:'Useful context'});expect(note.status).toBe(201);
    expect((await call('patch',`/api/resources/${note.body.id}`,users[1]).send({title:'Edited',body:'Updated note'})).status).toBe(200);
    expect((await call('post',`/api/projects/${p.id}/resources`,users[0]).send({stage_id:stage,kind:'link',title:'Unsafe',body:'file:///etc/passwd'})).status).toBe(400);
    expect((await call('get',`/api/projects/${p.id}`,users[0])).body.progress).toBe(0);
    expect((await call('delete',`/api/resources/${file.body.id}`,users[0])).status).toBe(200);expect((await call('get',`/api/files/${file.body.id}/download`,users[0])).status).toBe(404);
  });
  it('persists a single plain-text chat with authors, unread count and personal read receipts',async()=>{
    const {p,users}=await room(2,1);expect((await call('post',`/api/projects/${p.id}/chat`,users[0]).send({body:'<b>Plain text, not HTML</b>'})).status).toBe(201);
    expect((await call('get',`/api/projects/${p.id}/workflow`,users[1])).body.chat_unread).toBe(1);
    await call('post',`/api/projects/${p.id}/chat/read`,users[1]);store.close();store=await openStore(directory);app=createApp(store);
    const messages=(await call('get',`/api/projects/${p.id}/chat`,users[1])).body;expect(messages[0].author_name).toBe('Student 1');expect(messages[0].body).toContain('<b>');expect((await call('get',`/api/projects/${p.id}/workflow`,users[1])).body.chat_unread).toBe(0);
  });
  it('catches up once for 24h/overdue and removes stale alerts after an approved DDL change',async()=>{
    const {p,users,tasks}=await room(2,1),w=workflows(store),at=Date.parse(deadline);
    store.transaction(()=>{w.catchUp(p.id,at-3600000);w.catchUp(p.id,at-3600000);w.catchUp(p.id,at+1);w.catchUp(p.id,at+1);});
    expect(store.all("SELECT * FROM notifications WHERE kind='due_24h'")).toHaveLength(1);expect(store.all("SELECT * FROM notifications WHERE kind='overdue'")).toHaveLength(1);
    const change=await approve(await proposal(p,users[0],{type:'task_update',task_id:tasks[0].id,due_at:'2028-06-01T12:00:00.000Z'}),users);await call('post',`/api/requests/${change.id}/apply`,users[0]);
    expect(store.all("SELECT * FROM notifications WHERE kind IN ('due_24h','overdue')")).toHaveLength(0);
    const own=(await call('get','/api/notifications',users[0])).body,other=(await call('get','/api/notifications',users[1])).body;expect(own.some((n:{kind:string})=>n.kind==='assignment')).toBe(true);expect(other.every((n:{kind:string})=>n.kind!=='assignment')).toBe(true);
  });
  it('archives only after team majority and blocks all project content mutations while preserving read/download/report',async()=>{
    const {p,users,tasks}=await room(4,1);expect((await call('get',`/api/projects/${p.id}`,users[0])).body.status).toBe('ongoing');
    expect((await call('post',`/api/projects/${p.id}/requests`,users[1]).send({proposal:{type:'finish'},reason:'Done'})).status).toBe(403);
    const finish=await proposal(p,users[0],{type:'finish'});await call('post',`/api/requests/${finish.id}/votes`,users[1]).send({decision:'approve'});expect((await call('get',`/api/projects/${p.id}`,users[0])).body.status).toBe('ongoing');
    expect((await call('post',`/api/requests/${finish.id}/votes`,users[2]).send({decision:'approve'})).body.status).toBe('applied');
    for(const [url,body]of [[`/api/projects/${p.id}/chat`,{body:'New text'}],[`/api/projects/${p.id}/resources`,{stage_id:p.stages[0].id,kind:'note',title:'N',body:'B'}],[`/api/leaf-tasks/${tasks[0].id}/submissions`,{text:'Late edit'}],[`/api/projects/${p.id}/requests`,{proposal:{type:'project_update',name:'Changed'},reason:'No'}]] as const)expect((await call('post',url,users[0]).send(body)).status).toBe(409);
    expect((await call('post',`/api/requests/${finish.id}/votes`,users[3]).send({decision:'approve'})).status).toBe(409);
    expect((await call('get',`/api/projects/${p.id}/report`,users[0])).status).toBe(200);expect((await call('get',`/api/projects/${p.id}/workflow`,users[0])).body.project.status).toBe('archived');
  });
  it('rejects cross-project access for tasks, workflow, resources, chat, report and downloads',async()=>{
    const a=await room(2,1),b=await room(2,1),stranger=b.users[0];
    for(const suffix of ['workflow','resources','chat','report'])expect((await call('get',`/api/projects/${a.p.id}/${suffix}`,stranger)).status).toBe(403);
    expect((await call('post',`/api/leaf-tasks/${a.tasks[0].id}/submissions`,stranger).send({text:'No'})).status).toBe(403);
  });
});
