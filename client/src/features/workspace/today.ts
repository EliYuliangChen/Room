import type {WorkflowSnapshot} from '../../../../shared/types.js';
import {leaves} from '../../../../shared/metrics.js';

// Both the room thumbnail and the full Whiteboard describe these same actions.
export function getToday(snapshot:WorkflowSnapshot,userId:string){
  const p=snapshot.project,units=leaves(p.stages.flatMap(s=>s.tasks));
  const myWork=units.filter(t=>t.assignee_user_id===userId&&t.status!=='completed').sort((a,b)=>(a.due_at||'z').localeCompare(b.due_at||'z'));
  const revisions=myWork.flatMap(t=>t.submissions.filter(s=>s.id===t.current_submission_id&&s.outcome==='changes_requested').map(s=>({t,s})));
  const toReview=units.flatMap(t=>t.submissions.filter(s=>s.id===t.current_submission_id&&s.outcome==='pending_review'&&s.author_id!==userId&&!s.votes.some(v=>v.reviewer_id===userId)).map(s=>({t,s})));
  const consents=snapshot.requests.filter(r=>r.status==='pending'&&r.consents.some(c=>c.target_user_id===userId&&c.status==='pending'));
  const decisions=snapshot.requests.filter(r=>(r.status==='pending'&&r.threshold>1&&!r.votes.some(v=>v.voter_id===userId))||(p.creator_id===userId&&r.status==='approved_waiting_for_creator'));
  return {nextSteps:myWork.filter(t=>t.status!=='changes_requested'),revisions,toReview,consents,decisions};
}
