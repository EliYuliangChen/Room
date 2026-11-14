import type { ChangeRequest, Project } from '../../../../shared/types';
import { api } from '../../lib/api';
import { dateTimeLabel } from '../../lib/copy';
import type { Mutate } from './types';
function display(value:unknown,key:string,p:Project):string {
  if(value===null||value===undefined||value==='')return '—';
  if(key==='assignee_user_id')return p.members.find(m=>m.user_id===value)?.display_name||'Unassigned';
  if(key.endsWith('_at'))return dateTimeLabel(String(value));
  if(Array.isArray(value))return value.map(v=>typeof v==='object'&&v?`${v.title}${v.assignee_user_id?` — ${p.members.find(m=>m.user_id===v.assignee_user_id)?.display_name}`:''}`:String(v)).join('; ');
  return String(value);
}
export function RequestList({requests,project,userId,mutate,busy,selected}:{requests:ChangeRequest[];project:Project;userId:string;mutate:Mutate;busy:boolean;selected?:string}) {
  if(!requests.length)return <p className="empty-panel">No change requests. Once the plan is confirmed, proposals and team decisions appear here.</p>;
  return <div className="request-list">{requests.map(r=>{
    const before=(r.before||{}) as Record<string,unknown>,fields=Object.entries(r.proposed).filter(([k])=>!['type','task_id','stage_id','parent_task_id'].includes(k)),yes=r.votes.filter(v=>v.decision==='approve').length,readOnly=project.status==='archived',consent=r.consents.find(c=>c.target_user_id===userId&&c.status==='pending');
    return <article className={`request-card ${selected===r.id?'highlight':''}`} key={r.id} id={`request-${r.id}`}><div className="section-row"><h3>{r.type==='finish'?'Finish Project':r.type.replaceAll('_',' ')}</h3><span className="pill">{r.status.replaceAll('_',' ')}</span></div><p className="fine-print">{r.author_name} · {dateTimeLabel(r.created_at)}</p>{Boolean(before.title)&&<p><strong>{String(before.title)}</strong></p>}<p className="preserve-lines">{r.reason}</p>{fields.length>0&&<table className="change-table"><thead><tr><th>Field</th><th>Before</th><th>Proposed</th></tr></thead><tbody>{fields.map(([k,v])=><tr key={k}><td>{k==='assignee_user_id'?'Owner':k.replaceAll('_',' ')}</td><td>{display(before[k],k,project)}</td><td>{display(v,k,project)}</td></tr>)}</tbody></table>}<p><strong>{yes} Yes</strong> · {r.threshold} required {r.threshold===1?'for this targeted offer':'from the whole team'}</p><div className="request-votes">{r.votes.map(v=><span className="pill" key={v.voter_id}>{v.display_name}: {v.decision==='approve'?'Yes':'No'}</span>)}</div>{r.consents.map(c=><p className="consent-line" key={c.target_user_id}>Owner consent — <strong>{c.display_name}</strong>: {c.status}</p>)}
      <div className="action-wrap">{!readOnly&&r.status==='pending'&&r.threshold>1&&!r.votes.some(v=>v.voter_id===userId)&&<><button className="button small primary" disabled={busy} onClick={()=>mutate(()=>api.voteChange(r.id,'approve'),'Yes vote recorded.')}>Approve change</button><button className="button small" disabled={busy} onClick={()=>mutate(()=>api.voteChange(r.id,'reject'),'No vote recorded.')}>Reject change</button></>}{!readOnly&&r.status==='pending'&&consent&&<><button className="button small primary" disabled={busy} onClick={()=>mutate(()=>api.consent(r.id,true),'Your acceptance was recorded.')}>Accept this work</button><button className="button small" disabled={busy} onClick={()=>mutate(()=>api.consent(r.id,false),'Your refusal was recorded.')}>Decline this work</button></>}{!readOnly&&r.status==='approved_waiting_for_creator'&&project.creator_id===userId&&<button className="button small primary" disabled={busy} onClick={()=>mutate(()=>api.applyChange(r.id),'Approved change applied and announced.')}>Apply approved change</button>}{!readOnly&&r.author_id===userId&&['pending','approved_waiting_for_creator'].includes(r.status)&&<button className="text-link" disabled={busy} onClick={()=>mutate(()=>api.withdraw(r.id),'Request withdrawn.')}>Withdraw</button>}</div>
    </article>;
  })}</div>;
}
