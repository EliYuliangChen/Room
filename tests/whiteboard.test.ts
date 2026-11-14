import {describe,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {calculateMetrics} from '../shared/metrics.js';
import type {Member,Project,Submission,TaskNode,WorkflowSnapshot} from '../shared/types.js';
vi.mock('../client/src/lib/api',()=>({api:{},imageUrl:(source:string)=>source}));
const componentPath='../client/src/features/workspace/Whiteboard.tsx';
const {Whiteboard}=await import(componentPath);
import {getToday} from '../client/src/features/workspace/today.js';

const members=[{user_id:'a',display_name:'Alex',image_path:null},{user_id:'b',display_name:'Robin',image_path:null}] as Member[];
function task(id:string,owner='a',completed=false):TaskNode{return {id,project_id:'project',stage_id:'stage',parent_task_id:null,title:`Work ${id}`,description:'A clear deliverable.',sort_order:0,assignee_user_id:owner,due_at:'2027-06-01T12:00:00Z',created_at:'2026-10-27T12:00:00Z',retired_at:null,subtasks:[],status:completed?'completed':'to_do',overdue:false,accepted_submitted_at:null,submissions:[],active_submission_from:1,current_submission_id:null};}
function snapshot(tasks:TaskNode[],units=tasks):WorkflowSnapshot{return {project:{id:'project',name:'Planning test',creator_id:'a',status:'ongoing',members,stages:[{id:'stage',title:'Research',tasks}],final_due_at:'2027-07-01T12:00:00Z',...calculateMetrics(members,units)} as Project,requests:[],announcements:[],history:[],activity:[],chat_unread:0};}
const render=(data:WorkflowSnapshot)=>renderToStaticMarkup(createElement(Whiteboard,{snapshot:data,userId:'a',mutate:async()=>true,busy:false}));
function version(id:string,outcome:Submission['outcome'],author='a'):Submission{return {id,leaf_task_id:'leaf',author_id:author,version_no:id==='v1'?1:2,text_body:'Evidence',links:[],description:'',submitted_at:'2026-10-27T12:00:00Z',outcome,files:[],votes:[],threshold:1};}

describe('Whiteboard presentation keeps the accountability model',()=>{
  it('distinguishes equal-member progress from stage counts and excludes grouping parents',()=>{
    const units=[...Array.from({length:8},(_,i)=>task(`a${i}`,'a',i<2)),...Array.from({length:4},(_,i)=>task(`b${i}`,'b',i<2))];
    const group={...task('parent'),subtasks:units.slice(0,2)};
    const html=render(snapshot([group,...units.slice(2)],units));
    expect(html).toContain('aria-label="Team progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="37.5"');
    expect(html).toContain('aria-label="Research approved work" aria-valuemin="0" aria-valuemax="100" aria-valuenow="33.3"');
    expect(html).toContain('4 / 12 work units approved');expect(html).not.toContain('4 / 13');
    expect(html).toContain('Latest task due');expect(html).toContain('By member');
    expect(html).toContain('aria-label="Manage plan"');expect(html).not.toContain('aria-label="Task status"');
  });
  it('renders an empty draft with zero progress and no invented stage deadline',()=>{
    const data=snapshot([]);data.project.status='draft_setup';const html=render(data);
    expect(html).toContain('No task deadlines set');expect(html).toContain('0 / 0 work units approved');
    expect(html).not.toMatch(/NaN|Infinity/);expect(html).toContain('Confirm Initial Plan');
  });
  it('removes the current revision action on resubmission while preserving rejected history',()=>{
    const leaf=task('leaf');leaf.status='changes_requested';leaf.current_submission_id='v1';leaf.submissions=[version('v1','changes_requested')];
    const data=snapshot([leaf]);expect(getToday(data,'a').revisions).toHaveLength(1);expect(getToday(data,'a').nextSteps).toHaveLength(0);expect(render(data)).toContain('aria-label="Needs revision"');expect(render(data)).toContain('Revision requests are listed above.');
    leaf.current_submission_id='v2';leaf.status='pending_review';leaf.submissions.unshift(version('v2','pending_review'));
    expect(getToday(data,'a').revisions).toHaveLength(0);expect(getToday(data,'b').toReview[0].s.id).toBe('v2');
    expect(render(data)).not.toContain('aria-label="Needs revision"');expect(leaf.submissions[1].outcome).toBe('changes_requested');
  });
  it('shows reviews only to other eligible members and keeps archived planning read-only',()=>{
    const leaf=task('leaf');leaf.status='pending_review';leaf.current_submission_id='v1';leaf.submissions=[version('v1','pending_review')];const data=snapshot([leaf]);
    expect(getToday(data,'a').toReview).toEqual([]);expect(getToday(data,'b').toReview).toHaveLength(1);
    leaf.submissions[0].votes.push({reviewer_id:'b',display_name:'Robin',decision:'request_changes',note:'Please revise.',created_at:'2026-10-27T12:00:00Z'});
    expect(getToday(data,'b').toReview).toEqual([]);
    data.project.status='archived';const html=render(data);expect(html).toContain('Archived · read-only');
    expect(html).not.toContain('+ Add task');expect(html).not.toContain('Finish Project');
  });
});
