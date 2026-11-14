import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './db.js';
import { ApiError } from './errors.js';
import { readProject, taskViews } from './project-view.js';
import { leaves, formatPercent } from '../../shared/metrics.js';
import type { Project, TaskNode, ChangeRequest, ChangeProposal, NewLeaf, Notification } from '../../shared/types.js';

const title=z.string().trim().min(1).max(160), date=z.string().datetime({offset:true});
const leaf=z.object({title,description:z.string().trim().max(4000).default(''),assignee_user_id:z.string().uuid(),due_at:date}).strict();
export const proposalSchema=z.object({
  type:z.enum(['task_update','project_update','stage_add','stage_update','stage_remove','task_add','task_remove','task_split','task_merge','finish']),
  task_id:z.string().uuid().optional(),stage_id:z.string().uuid().optional(),title:title.optional(),description:z.string().trim().max(4000).optional(),
  name:z.string().trim().min(1).max(100).optional(),final_due_at:date.optional(),due_at:date.nullable().optional(),assignee_user_id:z.string().uuid().nullable().optional(),
  parent_task_id:z.string().uuid().nullable().optional(),children:z.array(leaf).min(1).max(30).optional()
}).strict();
export const stamp=()=>new Date().toISOString();
export function workflows(store:Store) {
  const memberIds=(id:string)=>store.all<{user_id:string}>('SELECT user_id FROM project_members WHERE project_id=?',[id]).map(m=>m.user_id);
  function project(id:string,user:string,writable=false) {
    const p=store.get<Project>('SELECT * FROM projects WHERE id=?',[id]);
    if(!p||!memberIds(id).includes(user))throw new ApiError(403,'Only project members can access this room.');
    if(writable&&p.status==='archived')throw new ApiError(409,'This archived project is read-only.');
    return p;
  }
  function ongoing(id:string,user:string) {const p=project(id,user,true);if(p.status!=='ongoing')throw new ApiError(409,'Confirm the initial plan before using this workflow.');return p;}
  function task(id:string,user:string,write=false) {
    const t=store.get<TaskNode>('SELECT * FROM tasks WHERE id=?',[id]);if(!t)throw new ApiError(404,'Task not found.');
    project(t.project_id,user,write);if(write&&t.retired_at)throw new ApiError(409,'This work unit is historical and read-only.');return t;
  }
  function event(id:string,user:string,kind:string,entity:string|null,details:unknown) {store.run('INSERT INTO activity_events VALUES (?,?,?,?,?,?,?)',[randomUUID(),id,user,kind,entity,JSON.stringify(details),stamp()]);}
  function notify(id:string,users:string[],kind:string,entity:string|null,text:string,key?:string) {
    for(const user of [...new Set(users)])store.run('INSERT OR IGNORE INTO notifications VALUES (?,?,?,?,?,?,?,?,?)',[randomUUID(),user,id,kind,entity,key?`${key}:${user}`:null,text,null,stamp()]);
  }
  function announce(id:string,user:string,text:string,requestId:string|null=null) {
    store.run('INSERT INTO announcements VALUES (?,?,?,?,?)',[randomUUID(),id,text,requestId,stamp()]);
    notify(id,memberIds(id),'announcement',requestId,text);event(id,user,'announcement',requestId,{text});
  }
  function activeTask(id:string|undefined,p:Project) {
    const t=store.get<TaskNode>('SELECT * FROM tasks WHERE id=? AND project_id=? AND retired_at IS NULL',[id||'',p.id]);if(!t)throw new ApiError(409,'The selected task no longer exists in the current plan.');return t;
  }
  function activeStage(id:string|undefined,p:Project) {
    const s=store.get<{id:string;title:string;sort_order:number}>('SELECT * FROM stages WHERE id=? AND project_id=? AND retired_at IS NULL',[id||'',p.id]);if(!s)throw new ApiError(409,'The selected stage no longer exists in the current plan.');return s;
  }
  const children=(id:string)=>store.all<TaskNode>('SELECT * FROM tasks WHERE parent_task_id=? AND retired_at IS NULL ORDER BY sort_order',[id]);
  function checkOwner(id:string|null|undefined,p:Project) {if(id&&!memberIds(p.id).includes(id))throw new ApiError(400,'The assignee must be a project member.');}
  function snapshot(p:Project,change:ChangeProposal):unknown {
    const kind=change.type;
    if(kind==='finish')return {status:p.status};
    if(kind==='project_update')return {name:p.name,description:p.description,final_due_at:p.final_due_at};
    if(kind==='stage_add')return null;
    if(kind==='stage_update'||kind==='stage_remove') {
      const s=activeStage(change.stage_id,p);
      return {id:s.id,title:s.title,tasks:kind==='stage_remove'?store.all('SELECT id,title,parent_task_id,assignee_user_id,due_at FROM tasks WHERE stage_id=? AND retired_at IS NULL ORDER BY id',[s.id]):undefined};
    }
    if(kind==='task_add') {const s=activeStage(change.stage_id,p);if(change.parent_task_id){const parent=activeTask(change.parent_task_id,p);if(parent.stage_id!==s.id||parent.parent_task_id||!children(parent.id).length)throw new ApiError(400,'Add subtasks only to an existing group. Use Split task to convert a leaf.');return {stage_id:s.id,parent_id:parent.id};}return {stage_id:s.id};}
    const t=activeTask(change.task_id,p);
    return {id:t.id,title:t.title,description:t.description,assignee_user_id:t.assignee_user_id,due_at:t.due_at,stage_id:t.stage_id,parent_task_id:t.parent_task_id,children:children(t.id).map(c=>({id:c.id,title:c.title,description:c.description,assignee_user_id:c.assignee_user_id,due_at:c.due_at}))};
  }
  function validate(p:Project,c:ChangeProposal) {
    const allowed:Record<string,string[]>={project_update:['type','name','description','final_due_at'],task_update:['type','task_id','title','description','assignee_user_id','due_at'],stage_add:['type','title'],stage_update:['type','stage_id','title'],stage_remove:['type','stage_id'],task_add:['type','stage_id','parent_task_id','title','description','assignee_user_id','due_at'],task_remove:['type','task_id'],task_split:['type','task_id','children'],task_merge:['type','task_id','title','description','assignee_user_id','due_at'],finish:['type']};
    if(Object.keys(c).some(k=>!allowed[c.type].includes(k)))throw new ApiError(400,'This change contains fields unrelated to its type.');
    snapshot(p,c);checkOwner(c.assignee_user_id,p);c.children?.forEach(child=>checkOwner(child.assignee_user_id,p));
    if(c.type==='project_update'&&c.name===undefined&&c.description===undefined&&!c.final_due_at)throw new ApiError(400,'Specify at least one project change.');
    if(['stage_add','stage_update','task_add','task_merge'].includes(c.type)&&!c.title)throw new ApiError(400,'A title is required.');
    if(c.type==='stage_remove'&&store.all('SELECT id FROM stages WHERE project_id=? AND retired_at IS NULL',[p.id]).length<=1)throw new ApiError(400,'Keep at least one stage.');
    if(c.type==='task_update') {const t=activeTask(c.task_id,p);if(!['title','description','assignee_user_id','due_at'].some(k=>(c as unknown as Record<string,unknown>)[k]!==undefined))throw new ApiError(400,'Specify at least one task change.');if(children(t.id).length&&(c.assignee_user_id||c.due_at))throw new ApiError(400,'A grouping task cannot own work or have a personal deadline.');}
    if(c.type==='task_split') {const t=activeTask(c.task_id,p);if(t.parent_task_id||children(t.id).length||!c.children?.length)throw new ApiError(400,'Split a direct task into one level of individually owned subtasks.');}
    if(c.type==='task_merge') {const t=activeTask(c.task_id,p);if(t.parent_task_id||!children(t.id).length)throw new ApiError(400,'Merge requires a root grouping task with subtasks.');}
    if(c.type==='task_remove') {const t=activeTask(c.task_id,p);if(t.parent_task_id&&children(t.parent_task_id).length===1)throw new ApiError(400,'Use Merge group before removing its last subtask.');}
    if(p.status==='ongoing'&&['task_add','task_merge'].includes(c.type)&&(!c.assignee_user_id||!c.due_at))throw new ApiError(400,'Every new leaf in a committed plan needs one owner and a personal deadline.');
    if(p.status==='ongoing'&&c.type==='task_update'&&(c.assignee_user_id===null||c.due_at===null))throw new ApiError(400,'A committed leaf must retain one owner and a personal deadline.');
    if(store.all('SELECT id FROM tasks WHERE project_id=? AND retired_at IS NULL',[p.id]).length+(c.children?.length||1)>300&&['task_add','task_split'].includes(c.type))throw new ApiError(400,'Use at most 300 current tasks.');
  }
  function insertTask(p:Project,stageId:string,input:{title:string;description?:string;assignee_user_id?:string;due_at?:string},parent:string|null=null) {
    const id=randomUUID(),order=store.get<{position:number}>('SELECT COALESCE(MAX(sort_order),-1)+1 AS position FROM tasks WHERE stage_id=? AND parent_task_id IS ?',[stageId,parent])!.position;store.run('INSERT INTO tasks (id,project_id,stage_id,parent_task_id,title,description,sort_order,assignee_user_id,due_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[id,p.id,stageId,parent,input.title,input.description||'',order,input.assignee_user_id||null,input.due_at||null,stamp()]);return id;
  }
  function retire(id:string) {store.run('UPDATE tasks SET retired_at=? WHERE (id=? OR parent_task_id=?) AND retired_at IS NULL',[stamp(),id,id]);}
  function apply(p:Project,c:ChangeProposal) {
    validate(p,c);
    if(c.type==='project_update')store.run('UPDATE projects SET name=?,description=?,final_due_at=? WHERE id=?',[c.name??p.name,c.description??p.description,c.final_due_at??p.final_due_at,p.id]);
    if(c.type==='stage_add')store.run('INSERT INTO stages (id,project_id,title,sort_order) SELECT ?,?,?,COALESCE(MAX(sort_order),-1)+1 FROM stages WHERE project_id=?',[randomUUID(),p.id,c.title!,p.id]);
    if(c.type==='stage_update')store.run('UPDATE stages SET title=? WHERE id=?',[c.title!,c.stage_id!]);
    if(c.type==='stage_remove'){store.run('UPDATE stages SET retired_at=? WHERE id=?',[stamp(),c.stage_id!]);store.run('UPDATE tasks SET retired_at=? WHERE stage_id=? AND retired_at IS NULL',[stamp(),c.stage_id!]);}
    if(c.type==='task_add')insertTask(p,c.stage_id!,c as NewLeaf,c.parent_task_id||null);
    if(c.type==='task_update'){const t=activeTask(c.task_id,p);store.run('UPDATE tasks SET title=?,description=?,assignee_user_id=?,due_at=? WHERE id=?',[c.title??t.title,c.description??t.description,c.assignee_user_id===undefined?t.assignee_user_id:c.assignee_user_id,c.due_at===undefined?t.due_at:c.due_at,t.id]);if(c.assignee_user_id!==undefined&&c.assignee_user_id!==t.assignee_user_id)store.run('UPDATE tasks SET active_submission_from=(SELECT COALESCE(MAX(version_no),0)+1 FROM submissions WHERE leaf_task_id=?) WHERE id=?',[t.id,t.id]);}
    if(c.type==='task_remove')retire(c.task_id!);
    if(c.type==='task_split'){const t=activeTask(c.task_id,p);retire(t.id);const group=insertTask(p,t.stage_id,{title:t.title,description:t.description});c.children!.forEach(child=>insertTask(p,t.stage_id,child,group));}
    if(c.type==='task_merge'){const t=activeTask(c.task_id,p);retire(t.id);insertTask(p,t.stage_id,c as NewLeaf);}
  }
  function requests(id:string):ChangeRequest[] {
    return store.all<ChangeRequest & {before_json:string;proposed_json:string;required_approvals:number|null}>('SELECT r.*,u.display_name AS author_name FROM change_requests r JOIN demo_users u ON u.id=r.author_id WHERE project_id=? ORDER BY r.created_at DESC,r.rowid DESC',[id]).map(r=>({...r,before:JSON.parse(r.before_json),proposed:JSON.parse(r.proposed_json),threshold:r.required_approvals??(isOffer(JSON.parse(r.proposed_json),JSON.parse(r.before_json))?1:Math.floor(memberIds(id).length/2)+1),votes:store.all('SELECT v.*,u.display_name FROM change_votes v JOIN demo_users u ON u.id=v.voter_id WHERE request_id=?',[r.id]) as ChangeRequest['votes'],consents:store.all('SELECT c.*,u.display_name FROM required_consents c JOIN demo_users u ON u.id=c.target_user_id WHERE request_id=?',[r.id]) as ChangeRequest['consents']}));
  }
  function isOffer(c:ChangeProposal,before:unknown) {return c.type==='task_update'&&!!c.assignee_user_id&&!(before as TaskNode)?.assignee_user_id&&!c.title&&c.description===undefined&&!c.due_at;}
  function settleRequest(id:string,user:string) {
    const raw=store.get<{project_id:string}>('SELECT project_id FROM change_requests WHERE id=?',[id]);if(!raw)throw new ApiError(404,'Request not found.');
    const r=requests(raw.project_id).find(r=>r.id===id)!;
    const yes=r.votes.filter(v=>v.decision==='approve').length,remaining=memberIds(raw.project_id).length-r.votes.length;
    if(r.consents.some(c=>c.status==='rejected')||yes+remaining<r.threshold)store.run("UPDATE change_requests SET status='rejected',required_approvals=? WHERE id=?",[r.threshold,id]);
    else if(yes>=r.threshold&&r.consents.every(c=>c.status==='accepted')) {
      store.run('UPDATE change_requests SET required_approvals=? WHERE id=?',[r.threshold,id]);
      if(r.type==='finish') {
        store.run("UPDATE projects SET status='archived',archived_at=? WHERE id=?",[stamp(),raw.project_id]);store.run("UPDATE change_requests SET status='applied',applied_at=? WHERE id=?",[stamp(),id]);
        store.run("UPDATE change_requests SET status='withdrawn',withdrawn_at=? WHERE project_id=? AND id<>? AND status IN ('pending','approved_waiting_for_creator')",[stamp(),raw.project_id,id]);
        announce(raw.project_id,user,'The team approved finishing this project. This room is now read-only.',id);
      }else {store.run("UPDATE change_requests SET status='approved_waiting_for_creator' WHERE id=?",[id]);notify(raw.project_id,[store.get<Project>('SELECT * FROM projects WHERE id=?',[raw.project_id])!.creator_id],'apply_change',id,'An approved change is ready for the creator to apply.',`apply:${id}`);}
    }
  }
  function catchUp(id:string,at=Date.now()) {
    const p=store.get<Project>('SELECT * FROM projects WHERE id=?',[id]);if(!p||p.status!=='ongoing')return;
    const units=leaves(readProject(store,id).stages.flatMap(s=>s.tasks));
    const valid=new Set<string>();
    for(const t of units)if(t.assignee_user_id&&t.due_at&&t.status!=='completed'){
      const due=Date.parse(t.due_at);for(const kind of ['due_24h','overdue'])valid.add(`${kind}:${t.id}:${t.due_at}:${t.assignee_user_id}`);
      const kind=at>=due?'overdue':at>=due-86400000?'due_24h':null;
      if(kind)notify(id,[t.assignee_user_id],kind,t.id,kind==='overdue'?`${t.title} is past its personal deadline.`:`${t.title} is due within 24 hours.`,`${kind}:${t.id}:${t.due_at}`);
    }
    for(const n of store.all<Notification & {dedupe_key:string}>('SELECT * FROM notifications WHERE project_id=? AND kind IN (\'due_24h\',\'overdue\')',[id]))if(!valid.has(n.dedupe_key))store.run('DELETE FROM notifications WHERE id=?',[n.id]);
  }
  function report(id:string) {
    const p=readProject(store,id);return [`${p.name}`,`Final deadline: ${p.final_due_at}`,`Project progress: ${formatPercent(p.progress)}`,p.unassigned?'Warning: Unassigned tasks remain.':'',...p.metrics.map(m=>`${m.name} | Assigned: ${m.assigned} | Approved: ${m.completed} | Completion: ${formatPercent(m.percentage)}${m.assigned?'':' (Unassigned)'} | On-time: ${m.on_time_rate===null?'N/A':formatPercent(m.on_time_rate)}`),'These are objective submission records, not a verdict on quality or effort.'].filter(Boolean).join('\n');
  }
  return {project,ongoing,task,memberIds,event,notify,announce,validate,snapshot,apply,requests,settleRequest,catchUp,report,children};
}
export type Workflows=ReturnType<typeof workflows>;
