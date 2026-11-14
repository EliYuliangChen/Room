import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AvatarLayout, Member } from '../../../shared/types';
import { DEFAULT_LAYOUT } from '../../../shared/types';
import { Art, AvatarFigure } from './Art';
import { officeLayout } from '../lib/scene-layout';
type Seat={source?:string|null;layout?:AvatarLayout;name?:string;online?:boolean;onSelect?:()=>void};
function DeskCluster({seats}:{seats:Seat[]}){
  return <div className={`desk-cluster cluster-${seats.length}`}>
    {seats.map((seat,i)=>{const layout=seat.layout||DEFAULT_LAYOUT,center=seats.length===1?50:i===0?25:75;return <div className="member-seat" key={i} style={{left:`${center}%`}}>
      <Art name="chair" className="seat-chair"/>
      {seat.name&&<div className="seat-label"><strong>{seat.name}</strong><span><i className={`status-dot ${seat.online?'online':''}`}/>{seat.online?'Online':'Offline'}</span></div>}
      {seat.source&&<div className="avatar-slot"><div className="avatar-transform" style={{transform:`translateX(${layout.offsetX}px) scale(${layout.flip?-layout.scale:layout.scale},${layout.scale})`}}><AvatarFigure source={seat.source} alt={seat.name?`${seat.name}'s avatar`:'Your avatar preview'}/></div></div>}
      <Art name="laptop-front" className="seat-laptop"/>
      {seat.onSelect&&<button className="station-hit" data-hotspot="member" aria-label={`View member ${seat.name}`} onClick={seat.onSelect}/>}
    </div>;})}
    <Art name="desk-top" className="seat-desk"/><Art name="mug" className="desk-mug"/><Art name="notebook" className="desk-notebook"/><Art name="pencils" className="desk-pencils"/>
  </div>;
}
export function WorkspaceSeats({members,currentId,onMember}:{members:Member[];currentId:string;onMember?:(id:string)=>void}){
  const pairs:Member[][]=[];for(let i=0;i<members.length;i+=2)pairs.push(members.slice(i,i+2));
  return <div className="workspace-seats">{pairs.map((pair,i)=><DeskCluster key={i} seats={pair.map(m=>({source:m.image_path,layout:m.avatar_layout,name:m.display_name,online:m.user_id===currentId,onSelect:onMember?()=>onMember(m.user_id):undefined}))}/>)}</div>;
}
export function OfficeScene({members=[],currentId='',onMember,board,onBoard,onFiles,onSubmit,chat,footer,previewSeat,fitViewport=false}:{members?:Member[];currentId?:string;onMember?:(id:string)=>void;board?:ReactNode;onBoard?:()=>void;onFiles?:()=>void;onSubmit?:()=>void;chat?:ReactNode;footer?:ReactNode;previewSeat?:Seat;fitViewport?:boolean}){
  const layout=officeLayout(members.length||2);
  const frame=useRef<HTMLDivElement>(null),[viewport,setViewport]=useState({width:1120,height:650});
  useEffect(()=>{if(!fitViewport)return;const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;setViewport({width,height});});observer.observe(frame.current!);return()=>observer.disconnect();},[fitViewport]);
  // Scale the complete composition together. Eight seats may extend horizontally.
  const scale=Math.min(viewport.height/layout.height,viewport.width/(members.length>6?1120:layout.minWidth));
  const width=Math.max(viewport.width,layout.minWidth*scale);
  const cabinet=<><Art name="bookshelf-files"/><span>Files</span></>;
  const submit=<><Art name="submit-tray-sign"/><span>Submit<br/>Your Part</span></>;
  const scene=<div className="office-scene" style={{minWidth:layout.minWidth,height:layout.height,...(fitViewport?{width:width/scale,transform:`scale(${scale})`,transformOrigin:'top left'}:{})}} data-member-count={members.length}>
    <Art name="room-shell" className="office-shell"/><Art name="floor-rug" className="office-rug"/>
    <Art name="ceiling-lamp" className="office-lamp"/><Art name="door-right" className="office-door"/>
    <div className="office-note"><Art name="sticky-note"/><span>Good ideas<br/>happen<br/>together. ☺</span></div><Art name="clipboard" className="office-clipboard"/>
    {onFiles?<button className="office-files scene-prop" data-hotspot="files" aria-label="Open Files cabinet" onClick={onFiles}>{cabinet}</button>:<div className="office-files scene-prop">{cabinet}</div>}
    <Art name="plant-large" className="office-plant"/>
    <section className="office-board"><Art name="whiteboard-blank"/>{board||<div className="office-board-quote">A little space.<br/>A shared purpose.<span>✳</span></div>}{onBoard&&<button className="office-board-hit" aria-label="Open planning whiteboard" data-hotspot="whiteboard" onClick={onBoard}/>}</section>
    {onSubmit?<button className="office-submit scene-prop" data-hotspot="submit" aria-label="Open Submit Your Part" onClick={onSubmit}>{submit}</button>:<div className="office-submit scene-prop">{submit}</div>}
    {members.length?<WorkspaceSeats members={members} currentId={currentId} onMember={onMember}/>:<div className={`workspace-seats ${previewSeat?'preview-seats':'empty-seats'}`}>{previewSeat?<DeskCluster seats={[previewSeat]}/>:<><DeskCluster seats={[{}]}/><DeskCluster seats={[{}]}/></>}</div>}
    {chat}{footer}
  </div>;
  return fitViewport?<div className="office-viewport" ref={frame}><div style={{width,height:layout.height*scale}}>{scene}</div></div>:scene;
}
function MiniOffice({children}:{children:ReactNode}){
  const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(560);
  useEffect(()=>{const observer=new ResizeObserver(([e])=>setWidth(e.contentRect.width));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
  return <div ref={ref} className="mini-office" style={{height:width*650/1120}}><div style={{width:1120,transform:`scale(${width/1120})`}}>{children}</div></div>;
}
export function AvatarPreview({source,layout}:{source?:string;layout:AvatarLayout}){return <MiniOffice><OfficeScene previewSeat={{source,layout}}/></MiniOffice>;}
export function OfficeHero(){return <MiniOffice><OfficeScene/></MiniOffice>;}
