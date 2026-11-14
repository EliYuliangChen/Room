import type { MemberMetric, TaskNode } from './types.js';
export function leaves(tasks: TaskNode[]): TaskNode[] { return tasks.flatMap(t=>t.subtasks.length?t.subtasks:[t]); }
export function calculateMetrics(members:{user_id:string;display_name:string}[], units:Pick<TaskNode,'assignee_user_id'|'status'|'due_at'|'accepted_submitted_at'>[]) {
  const metrics:MemberMetric[]=members.map(member=>{
    const assigned=units.filter(t=>t.assignee_user_id===member.user_id), done=assigned.filter(t=>t.status==='completed');
    const onTime=done.filter(t=>t.due_at&&t.accepted_submitted_at&&new Date(t.accepted_submitted_at).getTime()<=new Date(t.due_at).getTime()).length;
    return {user_id:member.user_id,name:member.display_name,assigned:assigned.length,completed:done.length,percentage:assigned.length?done.length/assigned.length*100:0,on_time_rate:done.length?onTime/done.length*100:null};
  });
  return {metrics,progress:metrics.length?metrics.reduce((sum,m)=>sum+m.percentage,0)/metrics.length:0,unassigned:units.filter(t=>!t.assignee_user_id).length};
}
export const formatPercent=(value:number)=>`${Number(value.toFixed(1))}%`;
