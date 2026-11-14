export interface DemoUser { id: string; display_name: string; display_email: string | null; created_at: string }
export interface Avatar { id: string; owner_user_id: string; label: string; source_kind: 'preset' | 'uploaded'; image_path: string; created_at: string }
export interface AvatarLayout { scale: number; flip: boolean; offsetX: number }
export interface Member { user_id: string; display_name: string; avatar_id: string | null; image_path: string | null; avatar_layout: AvatarLayout; joined_at: string }
export interface TaskInput { title: string; subtasks: { title: string }[] }
export interface StageInput { title: string; tasks: TaskInput[] }
export interface ProjectInput { name: string; description: string; final_due_at: string; stages: StageInput[] }
export interface TaskNode {
  id: string; project_id: string; stage_id: string; parent_task_id: string|null;
  title: string; description: string; sort_order: number; assignee_user_id: string|null;
  due_at: string|null; created_at: string; retired_at: string|null; subtasks: TaskNode[];
  status: 'unassigned'|'to_do'|'pending_review'|'changes_requested'|'completed';
  overdue: boolean; accepted_submitted_at: string|null; submissions: Submission[]; active_submission_from:number; current_submission_id:string|null;
}
export interface Stage { id: string; title: string; tasks: TaskNode[] }
export interface MemberMetric { user_id: string; name: string; assigned: number; completed: number; percentage: number; on_time_rate: number|null }
export interface Project { id: string; name: string; description: string; final_due_at: string; creator_id: string; status: 'draft_setup' | 'ongoing' | 'archived'; join_code: string; thumbnail_variant: number; created_at: string; archived_at: string|null; members: Member[]; stages: Stage[]; progress: number; metrics: MemberMetric[]; unassigned: number; chat_unread?: number }
export interface InvitePreview { id: string; name: string; final_due_at: string; member_count: number; is_member: boolean; join_code: string }
export const DEFAULT_LAYOUT: AvatarLayout = { scale: 1, flip: false, offsetX: 0 };
export const PRESETS = ['pencil', 'cat', 'donut'] as const;
export interface StoredFile { id: string; original_name: string; mime_type: string; byte_size: number }
export interface ReviewVote { reviewer_id: string; display_name: string; decision:'approve'|'request_changes'; note:string; created_at:string }
export interface Submission { id:string; leaf_task_id:string; author_id:string; version_no:number; text_body:string; links:string[]; description:string; submitted_at:string; outcome:'pending_review'|'changes_requested'|'approved'; files:StoredFile[]; votes:ReviewVote[]; threshold:number }
export type ChangeType = 'task_update'|'project_update'|'stage_add'|'stage_update'|'stage_remove'|'task_add'|'task_remove'|'task_split'|'task_merge'|'finish';
export interface NewLeaf { title:string; description?:string; assignee_user_id:string; due_at:string }
export interface ChangeProposal {
  type:ChangeType; task_id?:string; stage_id?:string; title?:string; description?:string;
  name?:string; final_due_at?:string; due_at?:string|null; assignee_user_id?:string|null;
  parent_task_id?:string|null; children?:NewLeaf[];
}
export interface ChangeRequest { id:string; project_id:string; author_id:string; author_name:string; type:ChangeType; before:unknown; proposed:ChangeProposal; reason:string; status:'pending'|'approved_waiting_for_creator'|'applied'|'rejected'|'withdrawn'; created_at:string; applied_at:string|null; threshold:number; votes:{voter_id:string;display_name:string;decision:'approve'|'reject'}[]; consents:{target_user_id:string;display_name:string;status:'pending'|'accepted'|'rejected'}[] }
export interface Notification {id:string;project_id:string;kind:string;entity_id:string|null;text:string;read_at:string|null;created_at:string}
export interface Announcement {id:string;message:string;created_at:string}
export interface Resource {id:string;stage_id:string;kind:'file'|'link'|'note';title:string;body_or_url:string;original_name:string|null;mime_type:string|null;byte_size:number|null;author_id:string;author_name:string;created_at:string;updated_at:string}
export interface ChatMessage {id:string;author_id:string;author_name:string;body:string;created_at:string}
export interface ActivityEvent {id:string;actor_name:string;event_kind:string;details_json:string;created_at:string}
export interface WorkflowSnapshot {project:Project;requests:ChangeRequest[];announcements:Announcement[];history:TaskNode[];activity:ActivityEvent[];chat_unread:number}
