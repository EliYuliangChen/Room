import type { Store } from './db.js';
import type { Project, Member, Stage, TaskNode, Submission, ReviewVote, StoredFile } from '../../shared/types.js';
import { calculateMetrics, leaves } from '../../shared/metrics.js';
export function taskViews(store:Store, projectId:string, historical=false):TaskNode[] {
  const members=store.all('SELECT user_id FROM project_members WHERE project_id=?',[projectId]);
  const tasks=store.all<TaskNode>(`SELECT * FROM tasks WHERE project_id=? ${historical?'':'AND retired_at IS NULL'} ORDER BY sort_order,created_at`,[projectId]);
  for(const task of tasks) {
    task.subtasks=[];
    task.submissions=store.all<Submission & {link_urls_json:string;required_approvals:number|null}>('SELECT * FROM submissions WHERE leaf_task_id=? ORDER BY version_no DESC',[task.id]).map(sub=>({...sub,links:JSON.parse(sub.link_urls_json),threshold:sub.required_approvals??Math.floor((members.length-1)/2)+1,files:store.all<StoredFile>('SELECT id,original_name,mime_type,byte_size FROM submission_files WHERE submission_id=?',[sub.id]),votes:store.all<ReviewVote>('SELECT v.*,u.display_name FROM review_votes v JOIN demo_users u ON u.id=v.reviewer_id WHERE submission_id=? ORDER BY v.created_at',[sub.id])}));
    const latest=task.submissions.find(s=>s.version_no>=task.active_submission_from);
    task.current_submission_id=latest?.id||null;
    task.status=!task.assignee_user_id?'unassigned':latest?latest.outcome==='approved'?'completed':latest.outcome:'to_do';
    task.accepted_submitted_at=latest?.outcome==='approved'?latest.submitted_at:null;
    task.overdue=!!task.due_at&&task.status!=='completed'&&Date.parse(task.due_at)<Date.now();
  }
  return tasks;
}
export function readProject(store:Store,id:string):Project {
  const project=store.get<Project>('SELECT * FROM projects WHERE id=?',[id])!;
  const members=store.all<Member & {avatar_layout_json:string}>('SELECT m.*,u.display_name,a.image_path FROM project_members m JOIN demo_users u ON u.id=m.user_id LEFT JOIN avatars a ON a.id=m.avatar_id WHERE m.project_id=? ORDER BY m.joined_at,m.user_id',[id]).map(m=>({...m,avatar_layout:JSON.parse(m.avatar_layout_json)}));
  const flat=taskViews(store,id);
  const stages=store.all<Stage>('SELECT id,title FROM stages WHERE project_id=? AND retired_at IS NULL ORDER BY sort_order',[id]).map(stage=>({...stage,tasks:flat.filter(t=>t.stage_id===stage.id&&!t.parent_task_id).map(t=>({...t,subtasks:flat.filter(s=>s.parent_task_id===t.id)}))}));
  return {...project,members,stages,...calculateMetrics(members,leaves(stages.flatMap(s=>s.tasks)))};
}
