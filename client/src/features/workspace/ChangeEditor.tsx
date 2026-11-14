import { Select } from '../../components/Select';
import { DateTimePicker } from '../../components/DateTimePicker';
import { useState } from 'react';
import type { ChangeProposal, Project, TaskNode, NewLeaf } from '../../../../shared/types';
import { api } from '../../lib/api';
import type { Mutate } from './types';
import { ErrorNote } from '../../components/ui';
export const localDate=(value:string|null|undefined)=>{if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const iso=(value:string)=>value?new Date(value).toISOString():null;
export function ChangeEditor({project,seed,onBack,mutate,busy}:{project:Project;seed:ChangeProposal;onBack:()=>void;mutate:Mutate;busy:boolean}) {
  const tasks=project.stages.flatMap(s=>s.tasks.flatMap(t=>[t,...t.subtasks]));const task=tasks.find(t=>t.id===seed.task_id),stage=project.stages.find(s=>s.id===seed.stage_id);
  const [title,setTitle]=useState(seed.type==='project_update'?project.name:seed.type==='stage_update'?stage?.title||'':seed.type==='task_update'||seed.type==='task_merge'?task?.title||'':''),[description,setDescription]=useState(seed.type==='project_update'?project.description:task?.description||''),[due,setDue]=useState(localDate(seed.type==='project_update'?project.final_due_at:task?.due_at)),[owner,setOwner]=useState(task?.assignee_user_id||''),[stageId,setStage]=useState(seed.stage_id||project.stages[0]?.id||''),[reason,setReason]=useState(''),[error,setError]=useState('');
  const [children,setChildren]=useState([{title:'',description:'',assignee_user_id:task?.assignee_user_id||'',due_at:localDate(task?.due_at)},{title:'',description:'',assignee_user_id:'',due_at:''}]);
  const draft=project.status==='draft_setup',isGroup=!!task?.subtasks.length;
  const needsTitle=['task_add','task_update','task_merge','stage_add','stage_update','project_update'].includes(seed.type);
  const needsOwner=['task_add','task_merge'].includes(seed.type)||(seed.type==='task_update'&&!isGroup);
  function ownerField(value:string,set:(v:string)=>void,required:boolean){return <label>One owner<Select aria-label="One owner" value={value} onChange={e=>set(e.target.value)} required={required}><option value="">Unassigned</option>{project.members.map(m=><option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</Select></label>;}
  async function save(){setError('');try{let c:ChangeProposal={...seed};
    if(seed.type==='project_update'){if(title!==project.name)c.name=title;if(description!==project.description)c.description=description;if(iso(due)!==project.final_due_at)c.final_due_at=iso(due)!;}
    if(seed.type==='stage_add'||seed.type==='stage_update')c.title=title;
    if(['task_add','task_merge'].includes(seed.type)){c={...c,title,description,assignee_user_id:owner||null,due_at:iso(due)};if(seed.type==='task_add')c.stage_id=stageId;}
    if(seed.type==='task_update'&&task){if(title!==task.title)c.title=title;if(description!==task.description)c.description=description;if(!isGroup){if((owner||null)!==task.assignee_user_id)c.assignee_user_id=owner||null;if(iso(due)!==task.due_at)c.due_at=iso(due);}}
    if(seed.type==='task_split')c.children=children.map(child=>({...child,due_at:iso(child.due_at)!})) as NewLeaf[];
    if(await mutate(()=>draft?api.draftChange(project.id,c):api.propose(project.id,c,reason),draft?'Draft updated.':'Request recorded. Your Yes vote is included.'))onBack();
  }catch(e){setError((e as Error).message);}}
  return <section className="change-editor"><button className="text-link" onClick={onBack}>← Back to whiteboard</button><h3>{seed.type==='finish'?'Finish Project':`${draft?'Edit draft:':'Propose:'} ${seed.type.replaceAll('_',' ')}`}</h3><p className="fine-print">{draft?'The creator can freely edit the initial draft.':seed.type==='finish'?'Your Yes vote is included. A majority of all members archives this room and makes project content read-only.':'Canonical work stays unchanged until the vote, any targeted consent, and creator application are complete.'}</p><ErrorNote error={error}/><form onSubmit={e=>{e.preventDefault();void save();}}>
    {needsTitle&&<label>{seed.type==='project_update'?'Project name':'Title'}<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label>}
    {['task_add','task_update','task_merge','project_update'].includes(seed.type)&&<label>Description<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} maxLength={4000}/></label>}
    {seed.type==='task_add'&&!seed.parent_task_id&&<label>Stage<Select value={stageId} onChange={e=>setStage(e.target.value)}>{project.stages.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</Select></label>}
    {needsOwner&&<div className="form-grid">{ownerField(owner,setOwner,!draft)}<DateTimePicker label="Personal deadline" required={!draft} value={due} onChange={setDue}/></div>}
    {seed.type==='project_update'&&<DateTimePicker label="Final project deadline" required value={due} onChange={setDue}/>}
    {seed.type==='task_split'&&<><p>Each new subtask is one independently owned leaf. Previous work stays in History.</p>{children.map((child,index)=><div className="split-child" key={index}><label>Subtask {index+1}<input required value={child.title} onChange={e=>setChildren(list=>list.map((v,i)=>i===index?{...v,title:e.target.value}:v))}/></label><div className="form-grid">{ownerField(child.assignee_user_id,v=>setChildren(list=>list.map((c,i)=>i===index?{...c,assignee_user_id:v}:c)),true)}<DateTimePicker label="Personal deadline" required value={child.due_at} onChange={due_at=>setChildren(list=>list.map((v,i)=>i===index?{...v,due_at}:v))}/></div>{children.length>1&&<button type="button" className="text-link" onClick={()=>setChildren(list=>list.filter((_,i)=>i!==index))}>Remove this subtask</button>}</div>)}<button className="button small" type="button" disabled={children.length>=30} onClick={()=>setChildren(list=>[...list,{title:'',description:'',assignee_user_id:'',due_at:''}])}>+ Add subtask</button></>}
    {['task_remove','task_merge','stage_remove'].includes(seed.type)&&<p className="local-callout">Affected work is retained in History. Retired work stops counting toward current progress; its submissions and files remain readable.</p>}
    {!draft&&<label>Reason<textarea required maxLength={2000} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
    <button className="button primary" disabled={busy}>{busy?'Saving…':draft?'Save draft change':seed.type==='finish'?'Request Finish Project':'Propose change'}</button>
  </form></section>;
}
