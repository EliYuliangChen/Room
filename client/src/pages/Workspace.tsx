import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Link2, Users, UserRound, CircleCheck, Bell, MessageCircle, ChevronDown, RefreshCw } from 'lucide-react';
import type { WorkflowSnapshot, Notification } from '../../../shared/types';
import { leaves, formatPercent } from '../../../shared/metrics';
import { api, roomUpdates } from '../lib/api';
import { dateTimeLabel } from '../lib/copy';
import { useIdentity } from '../App';
import { ErrorNote, Loading, Modal } from '../components/ui';
import { OfficeScene } from '../components/Scene';
import { InviteDetails } from './ProjectSetup';
import { Whiteboard } from '../features/workspace/Whiteboard';
import { SubmissionPanel,FilesPanel,ChatPanel,MemberPanel } from '../features/workspace/Panels';
import { NotificationList,noticeQuery } from '../features/workspace/Notifications';
import type { Mutate } from '../features/workspace/types';
import { ProgressBar } from '../components/ProgressBar';
import { getToday } from '../features/workspace/today';
type Panel='board'|'files'|'submit'|'chat'|'member'|'invite'|'notices'|null;
export function Workspace(){
  const {id}=useParams(),{user,openProfiles}=useIdentity(),location=useLocation();
  const [snapshot,setSnapshot]=useState<WorkflowSnapshot>(),[notices,setNotices]=useState<Notification[]>([]),[panel,setPanel]=useState<Panel>(null),[member,setMember]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState<{task?:string;review?:string;request?:string}>({});
  async function refresh(){const data=await api.workflow(id!);setSnapshot(data);setNotices((await api.notifications()).filter(n=>n.project_id===id));window.dispatchEvent(new Event('project-room:changed'));}
  useEffect(()=>{let active=true;setSnapshot(undefined);setError('');api.workspace(id!).then(()=>api.workflow(id!)).then(async data=>{if(active){setSnapshot(data);setNotices((await api.notifications()).filter(n=>n.project_id===id));}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,user!.id]);
  useEffect(()=>{if(location.search){const query=new URLSearchParams(location.search);setTarget({task:query.get('task')||undefined,review:query.get('review')||undefined,request:query.get('request')||undefined});setPanel('board');}},[location.search]);
  useEffect(()=>{const close=()=>setPanel(null);window.addEventListener('project-room:profiles',close);return()=>window.removeEventListener('project-room:profiles',close);},[]);
  useEffect(()=>{
    // An open chat refreshes its messages/read receipt itself. Otherwise update
    // the room's unread badge without requiring the chat to be opened.
    if(panel==='chat')return;
    const update=()=>{void refresh().catch(e=>setError(e.message));};
    const incoming=(e:MessageEvent<string>)=>{if(e.data===id)update();};
    roomUpdates.addEventListener('message',incoming);window.addEventListener('focus',update);
    return()=>{roomUpdates.removeEventListener('message',incoming);window.removeEventListener('focus',update);};
  },[id,user!.id,panel]);
  const mutate:Mutate=async(work,success='Saved locally.')=>{setBusy(true);setError('');setMessage('');try{await work();await refresh();setMessage(success);return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}};
  function open(value:Panel){setPanel(value);setError('');setMessage('');if(value==='board')setTarget({});}
  if(!snapshot){if(error.includes('Select your project avatar'))return <Navigate to={`/projects/${id}/avatar`} replace/>;return <main className="page"><Link className="button" to="/projects"><ArrowLeft size={17}/>Back to projects</Link><ErrorNote error={error}/>{!error&&<Loading/>}</main>;}
  const p=snapshot.project,units=leaves(p.stages.flatMap(s=>s.tasks)),archived=p.status==='archived',unread=notices.filter(n=>!n.read_at).length;
  const today=getToday(snapshot,user!.id);
  const title=panel==='board'?'Planning Whiteboard':panel==='files'?'Files · shared knowledge':panel==='submit'?'Submit Your Part':panel==='chat'?'Team Chat':panel==='member'?'A seat at the table':panel==='invite'?'Leave a seat for your people':'Your notifications';
  return <main className="workspace-page"><div className="workspace-topline"><Link to="/projects" className="icon-button" aria-label="Back to projects"><ArrowLeft/></Link><h2>{p.name}</h2><span className="vertical-divider"/><span><CalendarDays size={18}/>Due {dateTimeLabel(p.final_due_at)}</span><span className="pill">{p.status==='draft_setup'?'Draft':archived?'Archived':'Ongoing'}</span><span>{formatPercent(p.progress)}</span><div className="workspace-top-actions"><span><Users size={20}/>{p.members.length}/8 members</span><button className="notification-bell icon-button" aria-label="Project notifications" onClick={()=>open('notices')}><Bell size={20}/>{unread>0&&<span className="notice-badge">{unread}</span>}</button>{!archived&&<><button className="button small" onClick={()=>open('invite')}><Link2 size={16}/>Invite members</button><Link className="icon-button" aria-label="Change my project avatar" to={`/projects/${id}/avatar`}><UserRound size={20}/></Link></>}<button className="user-switcher" onClick={openProfiles} aria-label="Switch demo profile"><span className="initial-avatar">{user!.display_name[0]}</span><span>{user!.display_name}</span><ChevronDown size={16}/></button></div></div><div className="workspace-notice"><span className="pill">LOCAL DEMO</span><span>{archived?'Archived · project content is read-only. Reports, history and files remain accessible.':p.status==='draft_setup'?'Discuss your initial plan, assign each leaf, then let the creator confirm it on the Whiteboard.':'Assign → submit → confirm → track → report. Every decision stays in this room’s record.'}</span><button className="text-link refresh-room" onClick={()=>mutate(async()=>{},'Room refreshed.')}><RefreshCw size={14}/>Refresh room</button></div><ErrorNote error={!panel?error:''}/>{!panel&&message&&<p className="success-note" role="status">{message}</p>}
  <div className="workspace-scroll"><OfficeScene fitViewport members={p.members} currentId={user!.id} onMember={id=>{setMember(id);open('member');}} onBoard={()=>open('board')} onFiles={()=>open('files')} onSubmit={()=>open('submit')}
    board={<div className="office-board-content office-overview"><div className="office-overview-main"><span className="eyebrow">OUR SHARED SPACE</span><h2>{p.name}</h2><p>Due {dateTimeLabel(p.final_due_at)}</p><div className="office-progress-label"><span>Team progress</span><strong>{formatPercent(p.progress)}</strong></div><ProgressBar value={p.progress} label="Room team progress"/><span className="office-plan-count">{p.stages.length} stages · {units.length} work units</span>{p.unassigned>0&&<span className="office-draft-note">{p.unassigned} unassigned</span>}</div><div className="office-today"><strong>Today</strong>{archived?<span>Archived record</span>:p.status==='draft_setup'?<><span>Plan your responsibilities</span><span>Draft setup</span></>:<>{today.revisions.length>0&&<span className="office-today-alert">{today.revisions.length} needs revision</span>}<span>{today.toReview.length} to review</span><span>{today.consents.length+today.decisions.length} decisions waiting</span><span>{today.nextSteps.length} next steps</span></>}<span className="office-board-hint">View whiteboard ↗</span></div></div>}
    chat={<button className="team-chat-pill button" data-hotspot="chat" onClick={()=>open('chat')}><MessageCircle size={19}/>Team Chat{snapshot.chat_unread>0&&<span className="pill blush">{snapshot.chat_unread} new</span>}⌃</button>}
    footer={<div className="workspace-bottom"><span><CircleCheck size={16}/>Saved on this computer</span><span>{archived?'Archived record':p.status==='draft_setup'?'Initial plan not confirmed':'Only approved leaf units count toward progress'}</span></div>}/></div>
  {panel&&<Modal key={panel} title={title} onClose={()=>setPanel(null)} variant={panel==='board'?'board':panel==='files'?'left':panel==='submit'||panel==='notices'?'right':panel==='chat'?'chat':undefined} wide={panel==='member'}><ErrorNote error={error}/>{message&&<p className="success-note" role="status">{message}</p>}{panel==='board'?<Whiteboard snapshot={snapshot} userId={user!.id} mutate={mutate} busy={busy} initialTask={target.task} initialReview={target.review} initialRequest={target.request}/>:panel==='files'?<FilesPanel project={p} userId={user!.id} mutate={mutate} busy={busy}/>:panel==='submit'?<SubmissionPanel project={p} userId={user!.id} mutate={mutate} busy={busy}/>:panel==='chat'?<ChatPanel project={p} userId={user!.id} mutate={mutate} busy={busy} onRead={()=>{void refresh().catch(e=>setError(e.message));}}/>:panel==='member'?<MemberPanel snapshot={snapshot} memberId={member}/>:panel==='invite'?<InviteDetails project={p}/>:<NotificationList items={notices} onOpen={n=>{const query=new URLSearchParams(noticeQuery(n).slice(1));setTarget({task:query.get('task')||undefined,review:query.get('review')||undefined,request:query.get('request')||undefined});setPanel('board');void refresh();}}/>}</Modal>}
  </main>;
}
