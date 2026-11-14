import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, DoorOpen, Plus, Users, X } from 'lucide-react';
import type { DemoUser } from '../../shared/types';
import { api, getIdentity, setIdentity } from './lib/api';
import { asset } from './lib/assets';
import { BRAND, COPY } from './lib/copy';
import { Modal, ErrorNote, Loading } from './components/ui';
import { Landing, Projects, Home } from './pages/Overview';
import { Wizard, InvitePage, JoinPage, AvatarPage, Workspace } from './pages/Setup';
import { GlobalNotifications } from './features/workspace/Notifications';

const IdentityContext=createContext<{user:DemoUser|null;login:(user:DemoUser)=>Promise<void>;openProfiles:()=>void}>({user:null,login:async()=>{},openProfiles:()=>{}});
export const useIdentity=()=>useContext(IdentityContext);
export function ProfilePicker({onSelect}:{onSelect:(user:DemoUser)=>Promise<void>}) {
  const [users,setUsers]=useState<DemoUser[]>([]), [loaded,setLoaded]=useState(false), [creating,setCreating]=useState(false),[name,setName]=useState(''),[email,setEmail]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load(){setError('');try{const data=await api.users();setUsers(data);setCreating(data.length===0);setLoaded(true);}catch(e){setError((e as Error).message);}}
  useEffect(()=>{void load();},[]);
  async function select(user:DemoUser){setBusy(true);setError('');try{await onSelect(user);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className="profile-picker"><ErrorNote error={error}/>{!loaded&&!error&&<Loading/>}{!loaded&&error&&<button onClick={load} className="button">{COPY.retry}</button>}{loaded&&<>
    {!creating&&<><div className="profile-list">{users.map(user=><button disabled={busy} key={user.id} onClick={()=>select(user)} className="profile-row"><span className="initial-avatar">{user.display_name[0].toUpperCase()}</span><span><strong>{user.display_name}</strong><small>{user.display_email||'Local demo profile'}</small></span>{getIdentity()===user.id?<Check size={18}/>:<ArrowRight size={18}/>}</button>)}</div><button className="button full-width" onClick={()=>setCreating(true)}><Plus size={18}/>{COPY.addProfile}</button></>}
    {creating&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const user=await api.createUser(name,email);setUsers(list=>[...list,user]);await onSelect(user);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
      {users.length===0&&<div className="first-profile"><h3>{COPY.firstProfile}</h3><p>{COPY.firstProfileDetail}</p></div>}
      <label>{COPY.displayName}<input autoComplete="off" autoFocus required maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="What should we call you?"/></label>
      <label>{COPY.displayEmail}<input autoComplete="off" maxLength={200} value={email} onChange={e=>setEmail(e.target.value)} placeholder="Only a label, never verified"/></label>
      <button className="button primary full-width" disabled={busy||!name.trim()}>{busy?COPY.saving:COPY.createProfile}<ArrowRight size={18}/></button>
      {users.length>0&&<button type="button" disabled={busy} className="text-link" onClick={()=>setCreating(false)}>{COPY.back}</button>}
    </form>}<p className="fine-print profile-hint">{COPY.profileHint}</p>
  </>}</div>;
}
function Login() { const {login}=useIdentity();const [opened,setOpened]=useState(false);return <main className="login-page page"><div className="login-art"><div className="eyebrow">PULL UP A CHAIR</div><h1>A little space.<br/>A shared purpose.</h1><p>{BRAND.tagline}</p><img src={asset('office-01')} alt="Hand drawn shared study room"/></div><section className="login-panel sketch-panel"><span className="pill blush">{COPY.localBadge}</span><h2>{COPY.loginTitle}</h2><p>{COPY.loginIntro}</p>{opened?<ProfilePicker onSelect={login}/>:<><button className="button primary full-width" onClick={()=>setOpened(true)}>{COPY.demoLogin}<ArrowRight size={18}/></button><p className="fine-print">{COPY.profileHint}</p></>}</section></main>; }
function Protected({children}:{children:React.ReactNode}) {const {user}=useIdentity();const location=useLocation();if(!user){if(location.pathname.startsWith('/join/'))sessionStorage.setItem('project-room.invite',location.pathname);return <Navigate to="/login" replace/>;}return children;}
export default function App() {
  const [user,setUser]=useState<DemoUser|null>(null),[ready,setReady]=useState(false),[profilesOpen,setProfilesOpen]=useState(false),[sessionError,setSessionError]=useState('');
  const nav=useNavigate(),location=useLocation();
  function showProfiles(){window.dispatchEvent(new Event('project-room:profiles'));setProfilesOpen(true);}
  async function restore(){setSessionError('');try{if(getIdentity())setUser(await api.session());setReady(true);}catch(e){if((e as {status?:number}).status===401){setIdentity('');setUser(null);setReady(true);}else setSessionError((e as Error).message);}}
  useEffect(()=>{document.title=`${BRAND.name} · local demo`;void restore();},[]);
  async function login(next:DemoUser) {
    const previous=getIdentity(); setIdentity(next.id);
    try {await api.session();} catch(e){setIdentity(previous);throw e;}
    setUser(next);setProfilesOpen(false);
    const invitation=sessionStorage.getItem('project-room.invite');
    if(invitation){sessionStorage.removeItem('project-room.invite');nav(invitation);return;}
    const match=location.pathname.match(/^\/projects\/([^/]+)\/(workspace|avatar)$/);
    if(match){try{const project=await api.project(match[1]);const member=project.members.find(m=>m.user_id===next.id);nav(`/projects/${project.id}/${project.status==='archived'||member?.avatar_id?'workspace':'avatar'}`);return;}catch{/* new profile has no project membership */}}
    nav('/projects');
  }
  if(!ready)return <><Loading/><ErrorNote error={sessionError}/>{sessionError&&<button className="button" onClick={restore}>{COPY.retry}</button>}</>;
  const isLanding=location.pathname==='/', isWorkspace=location.pathname.endsWith('/workspace');
  return <IdentityContext.Provider value={{user,login,openProfiles:showProfiles}}>
    {!isWorkspace&&<header className="app-header"><Link className="wordmark" to="/"><span className="brand-icon"><DoorOpen size={23}/></span>{BRAND.name}<span className="local-tag">{COPY.localBadge}</span></Link>
      <nav aria-label="Main navigation">{user&&<><Link className={location.pathname==='/home'?'nav-active':''} to="/home">Home</Link><Link className={location.pathname.startsWith('/projects')?'nav-active':''} to="/projects">Projects</Link>{!isWorkspace&&<GlobalNotifications key={user.id}/>}</>}{!user&&!isLanding&&<Link to="/">Back to home</Link>}{user?<button className="user-switcher" onClick={showProfiles} aria-label={COPY.switchProfile}><span className="initial-avatar">{user.display_name[0].toUpperCase()}</span><span>{user.display_name}</span><ChevronDown size={17}/></button>:<Link className="button small" to="/login">{COPY.demoLogin}<ArrowRight size={16}/></Link>}</nav>
    </header>}
    <div key={user?.id||'visitor'}><Routes>
      <Route path="/" element={<Landing/>}/><Route path="/login" element={<Login/>}/>
      <Route path="/projects" element={<Protected><Projects/></Protected>}/><Route path="/home" element={<Protected><Home/></Protected>}/>
      <Route path="/projects/new" element={<Protected><Wizard/></Protected>}/><Route path="/projects/:id/edit" element={<Protected><Wizard/></Protected>}/>
      <Route path="/projects/:id/invite" element={<Protected><InvitePage/></Protected>}/>
      <Route path="/join" element={<Protected><JoinPage/></Protected>}/><Route path="/join/:code" element={<Protected><JoinPage/></Protected>}/>
      <Route path="/projects/:id/avatar" element={<Protected><AvatarPage/></Protected>}/><Route path="/projects/:id/workspace" element={<Protected><Workspace/></Protected>}/>
      <Route path="*" element={<main className="page"><h1>This room isn’t here.</h1><Link className="button" to="/projects">Back to projects</Link></main>}/>
    </Routes></div>
    {!isWorkspace&&<footer className="app-footer"><span>{BRAND.name} <span className="footer-doodle">✳</span> {BRAND.tagline}</span><span><i className="status-dot online"/>{COPY.localNote}</span></footer>}
    {profilesOpen&&<Modal title={COPY.switchProfile} onClose={()=>setProfilesOpen(false)}><ProfilePicker onSelect={login}/></Modal>}
  </IdentityContext.Provider>;
}
