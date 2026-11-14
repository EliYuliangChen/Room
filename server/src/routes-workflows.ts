import type { Express, Request } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './db.js';
import { workflows, proposalSchema, stamp } from './workflow.js';
import { readProject, taskViews } from './project-view.js';
import { ApiError } from './errors.js';
import { saveFiles, cleanupFiles } from './files.js';
import { leaves } from '../../shared/metrics.js';
import type { ChangeProposal, Project, Submission, TaskNode, Resource } from '../../shared/types.js';

const short=z.string().trim().min(1).max(160), bodyText=z.string().trim().max(20000);
const url=z.string().trim().url().max(2000).refine(s=>{try{return ['http:','https:'].includes(new URL(s).protocol);}catch{return false;}},'Use an http or https URL.');
const reason=z.string().trim().min(1).max(2000);
export function registerWorkflows(app:Express,store:Store,userId:(req:Request)=>string) {
  const w=workflows(store),directory=path.join(store.directory,'uploads');
  const upload=multer({storage:multer.memoryStorage(),defParamCharset:'utf8',limits:{fileSize:20*1024*1024,files:5,fields:8}});
  const authorizedUpload=(req:Request,_res:unknown,next:()=>void)=>{userId(req);next();};
  function requestRecord(id:string,user:string){const r=store.get<{project_id:string}>('SELECT project_id FROM change_requests WHERE id=?',[id]);if(!r)throw new ApiError(404,'Request not found.');const p=w.ongoing(r.project_id,user);return {p,r:w.requests(p.id).find(r=>r.id===id)!};}
  function personalRead(id:string,user:string){w.project(id,user);}

  app.get('/api/projects/:id/workflow',(req,res)=>{
    const user=userId(req);w.project(req.params.id,user);store.transaction(()=>w.catchUp(req.params.id));
    const p=readProject(store,req.params.id);
    res.json({project:p,requests:w.requests(p.id),announcements:store.all('SELECT * FROM announcements WHERE project_id=? ORDER BY created_at DESC,rowid DESC',[p.id]),history:taskViews(store,p.id,true).filter(t=>t.retired_at),activity:store.all('SELECT e.*,u.display_name AS actor_name FROM activity_events e JOIN demo_users u ON u.id=e.actor_id WHERE project_id=? ORDER BY e.created_at DESC,e.rowid DESC LIMIT 200',[p.id]),chat_unread:store.get<{count:number}>('SELECT COUNT(*) AS count FROM chat_messages WHERE project_id=? AND author_id<>? AND rowid>COALESCE((SELECT chat_read_seq FROM project_members WHERE project_id=? AND user_id=?),0)',[p.id,user,p.id,user])!.count});
  });
  app.post('/api/projects/:id/draft-change',(req,res)=>{
    const user=userId(req),p=w.project(req.params.id,user,true),c=proposalSchema.parse(req.body);
    if(p.status!=='draft_setup'||p.creator_id!==user)throw new ApiError(403,'Only the creator can freely edit the initial draft.');
    if(c.type==='finish')throw new ApiError(400,'Confirm a plan before finishing a project.');
    store.transaction(()=>{const before=w.snapshot(p,c);w.apply(p,c);w.event(p.id,user,'draft_updated',c.task_id||c.stage_id||p.id,{before,after:c});});res.json(readProject(store,p.id));
  });
  app.post('/api/projects/:id/finalize',(req,res)=>{
    const user=userId(req),p=w.project(req.params.id,user,true);
    if(p.creator_id!==user)throw new ApiError(403,'Only the creator confirms the initial plan.');
    if(p.status!=='draft_setup')throw new ApiError(409,'The initial plan is already confirmed.');
    const view=readProject(store,p.id),units=leaves(view.stages.flatMap(s=>s.tasks));
    if(view.members.length<2||!units.length||units.some(t=>!t.assignee_user_id||!t.due_at))throw new ApiError(400,'Require at least two members, one work unit, and one owner plus a personal deadline for every leaf task.');
    store.transaction(()=>{store.run("UPDATE projects SET status='ongoing' WHERE id=?",[p.id]);w.event(p.id,user,'plan_confirmed',p.id,{units:units.map(t=>({id:t.id,owner:t.assignee_user_id,due_at:t.due_at}))});w.announce(p.id,user,'The creator confirmed the initial plan. Later plan changes require a transparent request.');for(const t of units)w.notify(p.id,[t.assignee_user_id!],'assignment',t.id,`Your responsibility: ${t.title}.`);w.catchUp(p.id);});res.json(readProject(store,p.id));
  });
  app.post('/api/leaf-tasks/:id/submissions',authorizedUpload,upload.array('files',5),(req,res)=>{
    const user=userId(req),t=w.task(String(req.params.id),user,true);w.ongoing(t.project_id,user);
    if(w.children(t.id).length||t.assignee_user_id!==user)throw new ApiError(403,'Submit only a leaf task assigned to your current profile.');
    const latest=store.get<Submission>('SELECT * FROM submissions WHERE leaf_task_id=? AND version_no>=? ORDER BY version_no DESC LIMIT 1',[t.id,t.active_submission_from]);
    if(latest?.outcome==='pending_review')throw new ApiError(409,'The current version is still under review.');
    let links:unknown=req.body.links??[];if(typeof links==='string'){try{links=JSON.parse(links);}catch{throw new ApiError(400,'Links must be a JSON array of URLs.');}}
    const input=z.object({text:bodyText.default(''),links:z.array(url).max(10),description:z.string().trim().max(4000).default('')}).parse({text:req.body.text,links,description:req.body.description});
    const files=(req.files||[]) as Express.Multer.File[];
    if(!input.text&&!input.links.length&&!files.length)throw new ApiError(400,'Add meaningful text, at least one link, or an evidence file.');
    const saved=saveFiles(directory,files),id=randomUUID();
    try{store.transaction(()=>{const version=(store.get<{v:number}>('SELECT COALESCE(MAX(version_no),0)+1 AS v FROM submissions WHERE leaf_task_id=?',[t.id])!.v);store.run('INSERT INTO submissions (id,leaf_task_id,author_id,version_no,text_body,link_urls_json,description,submitted_at,outcome) VALUES (?,?,?,?,?,?,?,?,?)',[id,t.id,user,version,input.text,JSON.stringify(input.links),input.description,stamp(),'pending_review']);for(const f of saved)store.run('INSERT INTO submission_files VALUES (?,?,?,?,?,?,?)',[f.id,id,f.original_name,f.stored_name,f.mime_type,f.byte_size,stamp()]);w.event(t.project_id,user,'submission_created',id,{task:t.id,version});w.notify(t.project_id,w.memberIds(t.project_id).filter(id=>id!==user),'review',id,`Review required: ${t.title}, version ${version}.`);});}catch(e){cleanupFiles(directory,saved);throw e;}
    res.status(201).json(taskViews(store,t.project_id).find(x=>x.id===t.id));
  });
  app.post('/api/submissions/:id/votes',(req,res)=>{
    const user=userId(req),input=z.object({decision:z.enum(['approve','request_changes']),note:z.string().trim().max(2000).default('')}).strict().parse(req.body);
    if(input.decision==='request_changes'&&!input.note)throw new ApiError(400,'Add a short reason for requesting changes.');
    const s=store.get<Submission>('SELECT * FROM submissions WHERE id=?',[req.params.id]);if(!s)throw new ApiError(404,'Submission not found.');
    const t=w.task(s.leaf_task_id,user,true);w.ongoing(t.project_id,user);
    const current=taskViews(store,t.project_id).find(x=>x.id===t.id)!;
    if(s.author_id===user)throw new ApiError(403,'You cannot review your own submission.');
    if(s.outcome!=='pending_review'||current.current_submission_id!==s.id)throw new ApiError(409,'This review round is closed or historical.');
    if(store.get('SELECT 1 FROM review_votes WHERE submission_id=? AND reviewer_id=?',[s.id,user]))throw new ApiError(409,'You already voted on this version.');
    store.transaction(()=>{
      store.run('INSERT INTO review_votes VALUES (?,?,?,?,?)',[s.id,user,input.decision,input.note,stamp()]);
      const votes=store.all<{decision:string}>('SELECT decision FROM review_votes WHERE submission_id=?',[s.id]);const reviewers=w.memberIds(t.project_id).length-1,threshold=Math.floor(reviewers/2)+1,yes=votes.filter(v=>v.decision==='approve').length;
      const outcome=yes>=threshold?'approved':yes+reviewers-votes.length<threshold?'changes_requested':'pending_review';
      store.run('UPDATE submissions SET outcome=?,required_approvals=? WHERE id=?',[outcome,outcome==='pending_review'?null:threshold,s.id]);w.event(t.project_id,user,'review_vote',s.id,{decision:input.decision,note:input.note,outcome,threshold});
      if(outcome!=='pending_review')w.notify(t.project_id,[s.author_id],'review_result',s.id,`${t.title}: ${outcome==='approved'?'approved':'changes requested'}.`);
      w.catchUp(t.project_id);
    });res.json(taskViews(store,t.project_id).find(x=>x.id===t.id));
  });
  app.post('/api/projects/:id/requests',(req,res)=>{
    const user=userId(req),p=w.ongoing(req.params.id,user),input=z.object({proposal:proposalSchema,reason}).strict().parse(req.body),c=input.proposal;
    w.validate(p,c);if(c.type==='finish'&&p.creator_id!==user)throw new ApiError(403,'Only the creator starts Finish Project.');
    if(c.type==='finish'&&store.get("SELECT id FROM change_requests WHERE project_id=? AND type='finish' AND status='pending'",[p.id]))throw new ApiError(409,'A Finish Project request is already pending.');
    const id=randomUUID(),before=w.snapshot(p,c);
    store.transaction(()=>{
      store.run('INSERT INTO change_requests (id,project_id,author_id,type,before_json,proposed_json,reason,status,created_at,applied_at,withdrawn_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[id,p.id,user,c.type,JSON.stringify(before),JSON.stringify(c),input.reason,'pending',stamp(),null,null]);
      store.run('INSERT INTO change_votes VALUES (?,?,?,?)',[id,user,'approve',stamp()]);
      const priorOwner=(before as TaskNode|null)?.assignee_user_id;
      const targets=new Set<string>();if(c.assignee_user_id&&c.assignee_user_id!==priorOwner)targets.add(c.assignee_user_id);for(const child of c.children||[])targets.add(child.assignee_user_id);
      for(const target of targets){store.run('INSERT INTO required_consents VALUES (?,?,?,NULL)',[id,target,'pending']);w.notify(p.id,[target],'consent',id,'Your explicit acceptance is required for proposed work.');}
      w.event(p.id,user,'request_created',id,{before,proposal:c,reason:input.reason});
      const offer=c.type==='task_update'&&!priorOwner&&!!c.assignee_user_id&&!c.title&&c.description===undefined&&!c.due_at;
      if(!offer)w.notify(p.id,w.memberIds(p.id).filter(id=>id!==user),'request',id,c.type==='finish'?'Vote on finishing this project.':'A plan change needs your vote.');
      w.settleRequest(id,user);
    });res.status(201).json(w.requests(p.id).find(r=>r.id===id));
  });
  app.post('/api/requests/:id/votes',(req,res)=>{
    const user=userId(req),{p,r}=requestRecord(req.params.id,user),input=z.object({decision:z.enum(['approve','reject'])}).strict().parse(req.body);
    if(r.status!=='pending')throw new ApiError(409,'This request is no longer accepting votes.');
    if(r.threshold===1)throw new ApiError(403,'This targeted offer is decided by explicit owner consent rather than a team vote.');
    if(r.votes.some(v=>v.voter_id===user))throw new ApiError(409,'You already voted on this request.');
    store.transaction(()=>{store.run('INSERT INTO change_votes VALUES (?,?,?,?)',[r.id,user,input.decision,stamp()]);w.event(p.id,user,'change_vote',r.id,input);w.settleRequest(r.id,user);w.notify(p.id,[r.author_id],'request_result',r.id,'A team member voted on your change request.');});res.json(w.requests(p.id).find(x=>x.id===r.id));
  });
  app.post('/api/requests/:id/consents',(req,res)=>{
    const user=userId(req),{p,r}=requestRecord(req.params.id,user),input=z.object({accept:z.boolean()}).strict().parse(req.body);
    if(r.status!=='pending')throw new ApiError(409,'This request is no longer accepting consent.');
    if(!r.consents.some(c=>c.target_user_id===user&&c.status==='pending'))throw new ApiError(403,'This request is not waiting for your consent.');
    store.transaction(()=>{store.run('UPDATE required_consents SET status=?,responded_at=? WHERE request_id=? AND target_user_id=?',[input.accept?'accepted':'rejected',stamp(),r.id,user]);w.event(p.id,user,'target_consent',r.id,input);w.settleRequest(r.id,user);w.notify(p.id,[r.author_id],'request_result',r.id,'The proposed owner responded to the work offer.');});res.json(w.requests(p.id).find(x=>x.id===r.id));
  });
  app.post('/api/requests/:id/withdraw',(req,res)=>{
    const user=userId(req),{p,r}=requestRecord(req.params.id,user);if(r.author_id!==user||!['pending','approved_waiting_for_creator'].includes(r.status))throw new ApiError(403,'Only the proposer can withdraw an unapplied request.');
    store.transaction(()=>{store.run("UPDATE change_requests SET status='withdrawn',withdrawn_at=? WHERE id=?",[stamp(),r.id]);w.event(p.id,user,'request_withdrawn',r.id,{});});res.json({ok:true});
  });
  app.post('/api/requests/:id/apply',(req,res)=>{
    const user=userId(req),{p,r}=requestRecord(req.params.id,user);if(p.creator_id!==user)throw new ApiError(403,'Only the creator applies an approved change.');
    if(r.status!=='approved_waiting_for_creator')throw new ApiError(409,'The team vote and all required consents must be complete.');
    store.transaction(()=>{
      if(JSON.stringify(w.snapshot(p,r.proposed))!==JSON.stringify(r.before))throw new ApiError(409,'The target changed since this request. Withdraw it and propose against the current plan.');
      const priorIds=new Set(store.all<{id:string}>('SELECT id FROM tasks WHERE project_id=? AND retired_at IS NULL',[p.id]).map(t=>t.id));
      w.apply(p,r.proposed);store.run("UPDATE change_requests SET status='applied',applied_at=? WHERE id=?",[stamp(),r.id]);w.event(p.id,user,'change_applied',r.id,{before:r.before,after:r.proposed});w.announce(p.id,user,`${r.author_name}’s ${r.type.replaceAll('_',' ')} was approved and applied. Reason: ${r.reason}`,r.id);
      for(const t of leaves(readProject(store,p.id).stages.flatMap(s=>s.tasks)))if(t.assignee_user_id&&(!priorIds.has(t.id)||(r.proposed.type==='task_update'&&t.id===r.proposed.task_id&&r.proposed.assignee_user_id&&r.proposed.assignee_user_id!==(r.before as TaskNode).assignee_user_id)))w.notify(p.id,[t.assignee_user_id],'assignment',t.id,`Your approved responsibility: ${t.title}.`);
      w.catchUp(p.id);
    });res.json(readProject(store,p.id));
  });
  app.get('/api/notifications',(req,res)=>{
    const user=userId(req);store.transaction(()=>{for(const m of store.all<{project_id:string}>('SELECT project_id FROM project_members WHERE user_id=?',[user]))w.catchUp(m.project_id);});
    res.json(store.all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 300',[user]));
  });
  app.post('/api/notifications/:id/read',(req,res)=>{const user=userId(req);store.transaction(()=>store.run('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?',[stamp(),req.params.id,user]));res.json({ok:true});});
  app.get('/api/projects/:id/report',(req,res)=>{w.project(req.params.id,userId(req));res.json({text:w.report(req.params.id)});});
  app.get('/api/projects/:id/chat',(req,res)=>{w.project(req.params.id,userId(req));res.json(store.all('SELECT m.*,u.display_name AS author_name FROM chat_messages m JOIN demo_users u ON u.id=m.author_id WHERE project_id=? ORDER BY m.created_at,m.rowid',[req.params.id]));});
  app.post('/api/projects/:id/chat',(req,res)=>{
    const user=userId(req),p=w.project(req.params.id,user,true),input=z.object({body:z.string().trim().min(1).max(4000)}).strict().parse(req.body),id=randomUUID();
    store.transaction(()=>{store.run('INSERT INTO chat_messages VALUES (?,?,?,?,?)',[id,p.id,user,input.body,stamp()]);w.event(p.id,user,'chat_message',id,{});});res.status(201).json({id});
  });
  app.post('/api/projects/:id/chat/read',(req,res)=>{const user=userId(req);personalRead(req.params.id,user);store.transaction(()=>store.run('UPDATE project_members SET chat_read_at=?,chat_read_seq=(SELECT COALESCE(MAX(rowid),0) FROM chat_messages WHERE project_id=?) WHERE project_id=? AND user_id=?',[stamp(),req.params.id,req.params.id,user]));res.json({ok:true});});
  app.get('/api/projects/:id/resources',(req,res)=>{w.project(req.params.id,userId(req));res.json(store.all('SELECT r.*,u.display_name AS author_name FROM shared_resources r JOIN demo_users u ON u.id=r.author_id WHERE project_id=? AND deleted_at IS NULL ORDER BY r.created_at DESC,r.rowid DESC',[req.params.id]));});
  app.post('/api/projects/:id/resources',authorizedUpload,upload.single('file'),(req,res)=>{
    const user=userId(req),p=w.project(String(req.params.id),user,true),input=z.object({stage_id:z.string().uuid(),kind:z.enum(['file','link','note']),title:short,body:bodyText.default('')}).strict().parse(req.body);
    if(!store.get('SELECT id FROM stages WHERE id=? AND project_id=? AND retired_at IS NULL',[input.stage_id,p.id]))throw new ApiError(400,'Choose a current project stage.');
    if(input.kind==='file'&&!req.file)throw new ApiError(400,'Choose a file.');if(input.kind!=='file'&&req.file)throw new ApiError(400,'Use the File resource type for uploads.');
    if(input.kind==='link')url.parse(input.body);if(input.kind==='note'&&!input.body)throw new ApiError(400,'Write a note.');
    const files=saveFiles(directory,req.file?[req.file]:[]),f=files[0],id=randomUUID();
    try{store.transaction(()=>{store.run('INSERT INTO shared_resources VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,p.id,input.stage_id,input.kind,input.title,input.body,f?.stored_name||null,f?.original_name||null,f?.mime_type||null,f?.byte_size||null,user,stamp(),stamp(),null]);w.event(p.id,user,'resource_added',id,{kind:input.kind,title:input.title});});}catch(e){cleanupFiles(directory,files);throw e;}res.status(201).json({id});
  });
  app.patch('/api/resources/:id',(req,res)=>{
    const user=userId(req),r=store.get<Resource & {project_id:string}>('SELECT * FROM shared_resources WHERE id=? AND deleted_at IS NULL',[req.params.id]);if(!r)throw new ApiError(404,'Resource not found.');const p=w.project(r.project_id,user,true);
    if(r.author_id!==user&&p.creator_id!==user)throw new ApiError(403,'Only the resource author or project creator can edit it.');
    const input=z.object({title:short,body:bodyText}).strict().parse(req.body);if(r.kind==='link')url.parse(input.body);if(r.kind==='note'&&!input.body)throw new ApiError(400,'Write a note.');
    store.transaction(()=>{store.run('UPDATE shared_resources SET title=?,body_or_url=?,updated_at=? WHERE id=?',[input.title,input.body,stamp(),r.id]);w.event(p.id,user,'resource_edited',r.id,input);});res.json({ok:true});
  });
  app.delete('/api/resources/:id',(req,res)=>{
    const user=userId(req),r=store.get<Resource & {project_id:string}>('SELECT * FROM shared_resources WHERE id=? AND deleted_at IS NULL',[req.params.id]);if(!r)throw new ApiError(404,'Resource not found.');const p=w.project(r.project_id,user,true);
    if(r.author_id!==user&&p.creator_id!==user)throw new ApiError(403,'Only the resource author or project creator can delete it.');
    store.transaction(()=>{store.run('UPDATE shared_resources SET deleted_at=? WHERE id=?',[stamp(),r.id]);w.event(p.id,user,'resource_deleted',r.id,{title:r.title});});res.json({ok:true});
  });
  app.get('/api/files/:id/download',(req,res)=>{
    const user=userId(req);let f=store.get<{project_id:string;stored_name:string;original_name:string;mime_type:string}>('SELECT f.*,t.project_id FROM submission_files f JOIN submissions s ON s.id=f.submission_id JOIN tasks t ON t.id=s.leaf_task_id WHERE f.id=?',[req.params.id]);
    if(!f)f=store.get('SELECT project_id,stored_file_name AS stored_name,original_name,mime_type FROM shared_resources WHERE id=? AND kind=\'file\' AND deleted_at IS NULL',[req.params.id]);
    if(!f)throw new ApiError(404,'File not found.');w.project(f.project_id,user);
    res.type(f.mime_type).download(path.join(directory,f.stored_name),f.original_name,{dotfiles:'allow'});
  });
}
