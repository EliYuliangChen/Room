import type { DemoUser, Project, ProjectInput, Avatar, AvatarLayout, InvitePreview, WorkflowSnapshot, ChangeProposal, ChangeRequest, TaskNode, Notification, Resource, ChatMessage } from '../../../shared/types';
const identityKey = 'project-room.user';
let currentUserId = sessionStorage.getItem(identityKey) ?? localStorage.getItem(identityKey) ?? '';
if (currentUserId) sessionStorage.setItem(identityKey, currentUserId);
export function setIdentity(id: string) {
  currentUserId = id;
  if (id) { sessionStorage.setItem(identityKey, id); localStorage.setItem(identityKey, id); }
  else { sessionStorage.removeItem(identityKey); localStorage.removeItem(identityKey); }
}
export const getIdentity = () => currentUserId;
// A same-origin tab signal only; the SQLite API remains the source of saved room state.
export const roomUpdates = new BroadcastChannel('project-room:updates');
export function imageUrl(source: string) { return source.startsWith('/api/') ? `${source}?user=${encodeURIComponent(currentUserId)}` : source; }
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (currentUserId) headers.set('x-demo-user-id', currentUserId);
  const response = await fetch(`/api${url}`, { ...init, headers });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new ApiError(response.status, body.error || 'Could not reach the local server.'); }
  return response.json();
}
export const api = {
  users: () => request<DemoUser[]>('/demo-users'),
  createUser: (display_name: string, display_email: string) => request<DemoUser>('/demo-users', { method: 'POST', body: JSON.stringify({ display_name, display_email }) }),
  session: () => request<DemoUser>('/demo-session'),
  projects: () => request<Project[]>('/projects'),
  project: (id: string) => request<Project>(`/projects/${id}`),
  workspace: (id: string) => request<Project>(`/projects/${id}/workspace`),
  archiveDraft: (id: string) => request<Project>(`/projects/${id}/archive-draft`, { method:'POST' }),
  saveProject: (input: ProjectInput, id?: string) => request<Project>(id ? `/projects/${id}/draft` : '/projects', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) }),
  invitation: (code: string) => request<InvitePreview>(`/invitations/${encodeURIComponent(code)}`),
  avatars: () => request<Avatar[]>('/avatars'),
  preset: (preset: string) => request<Avatar>('/avatars/preset', { method: 'POST', body: JSON.stringify({ preset }) }),
  upload: (image: File) => { const body = new FormData(); body.append('image', image); return request<Avatar>('/avatars/upload', { method:'POST', body }); },
  setAvatar: (id: string, avatar_id: string, layout: AvatarLayout) => request<Project>(`/projects/${id}/avatar`, { method:'PUT', body:JSON.stringify({ avatar_id, layout }) }),
  join: (id: string, code: string, avatar_id: string, layout: AvatarLayout) => request<Project>(`/projects/${id}/join`, { method:'POST', body:JSON.stringify({ code, avatar_id, layout }) }),
  workflow:(id:string)=>request<WorkflowSnapshot>(`/projects/${id}/workflow`),
  draftChange:(id:string,proposal:ChangeProposal)=>request<Project>(`/projects/${id}/draft-change`,{method:'POST',body:JSON.stringify(proposal)}),
  finalize:(id:string)=>request<Project>(`/projects/${id}/finalize`,{method:'POST'}),
  submit:async(id:string,body:FormData)=>{const task=await request<TaskNode>(`/leaf-tasks/${id}/submissions`,{method:'POST',body});roomUpdates.postMessage(task.project_id);return task;},
  review:async(id:string,decision:'approve'|'request_changes',note:string)=>{const task=await request<TaskNode>(`/submissions/${id}/votes`,{method:'POST',body:JSON.stringify({decision,note})});roomUpdates.postMessage(task.project_id);return task;},
  propose:(id:string,proposal:ChangeProposal,reason:string)=>request<ChangeRequest>(`/projects/${id}/requests`,{method:'POST',body:JSON.stringify({proposal,reason})}),
  voteChange:(id:string,decision:'approve'|'reject')=>request<ChangeRequest>(`/requests/${id}/votes`,{method:'POST',body:JSON.stringify({decision})}),
  consent:(id:string,accept:boolean)=>request<ChangeRequest>(`/requests/${id}/consents`,{method:'POST',body:JSON.stringify({accept})}),
  applyChange:(id:string)=>request<Project>(`/requests/${id}/apply`,{method:'POST'}),
  withdraw:(id:string)=>request<{ok:boolean}>(`/requests/${id}/withdraw`,{method:'POST'}),
  notifications:()=>request<Notification[]>('/notifications'),
  readNotification:(id:string)=>request<{ok:boolean}>(`/notifications/${id}/read`,{method:'POST'}),
  report:(id:string)=>request<{text:string}>(`/projects/${id}/report`),
  chat:(id:string)=>request<ChatMessage[]>(`/projects/${id}/chat`),
  sendChat:async(id:string,body:string)=>{const message=await request<{id:string}>(`/projects/${id}/chat`,{method:'POST',body:JSON.stringify({body})});roomUpdates.postMessage(id);return message;},
  readChat:(id:string)=>request<{ok:boolean}>(`/projects/${id}/chat/read`,{method:'POST'}),
  resources:(id:string)=>request<Resource[]>(`/projects/${id}/resources`),
  addResource:(id:string,body:FormData)=>request<{id:string}>(`/projects/${id}/resources`,{method:'POST',body}),
  editResource:(id:string,title:string,body:string)=>request<{ok:boolean}>(`/resources/${id}`,{method:'PATCH',body:JSON.stringify({title,body})}),
  deleteResource:(id:string)=>request<{ok:boolean}>(`/resources/${id}`,{method:'DELETE'}),
  fileHref:(id:string)=>`/api/files/${encodeURIComponent(id)}/download?user=${encodeURIComponent(currentUserId)}`,
};
