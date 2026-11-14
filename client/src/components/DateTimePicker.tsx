import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { Select } from './Select';
import './DateTimePicker.css';

export function DateTimePicker({value,onChange,label,required=false,hint}:{value:string;onChange:(value:string)=>void;label:string;required?:boolean;hint?:string}){
  const id=useId();
  const [open,setOpen]=useState(false),[invalid,setInvalid]=useState(false),[position,setPosition]=useState({top:0,left:0});
  const [month,setMonth]=useState(()=>{const date=value?new Date(value):new Date();return new Date(date.getFullYear(),date.getMonth(),1);});
  const trigger=useRef<HTMLButtonElement>(null),calendar=useRef<HTMLDivElement>(null),popup=useRef<HTMLDivElement>(null);
  const year=month.getFullYear(),monthIndex=month.getMonth(),monthName=month.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const firstWeekday=(month.getDay()+6)%7,days=new Date(year,monthIndex+1,0).getDate();
  const date=value.slice(0,10),[hour,minute]=(value?value.slice(11):'23:59').split(':');
  const now=new Date(),today=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
  useLayoutEffect(()=>{
    if(open){
      const field=trigger.current!.getBoundingClientRect(),box=popup.current!.getBoundingClientRect();
      setPosition({top:Math.max(8,Math.min(field.bottom+8,window.innerHeight-box.height-8)),left:Math.min(field.left,window.innerWidth-box.width-8)});
    }
  },[open,month]);
  useEffect(()=>{if(open)calendar.current!.querySelector<HTMLButtonElement>('[aria-pressed="true"],.is-today,button')!.focus();},[open]);
  return <div className="datetime-field">
    <label htmlFor={`${id}-trigger`}>{label}{required&&<span className="required"> *</span>}</label>
    <div className="datetime-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);trigger.current!.focus();}}}>
      <button ref={trigger} id={`${id}-trigger`} className="deadline-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-calendar`} aria-describedby={hint?`${id}-hint`:undefined} onClick={()=>{if(!open){const selected=value?new Date(value):new Date();setMonth(new Date(selected.getFullYear(),selected.getMonth(),1));}setOpen(!open);}}>
        <CalendarDays size={19}/><span>{value?`${new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · ${hour}:${minute}`:'Choose a date and time'}</span><ChevronRight size={16} className={open?'is-open':''}/>
      </button>
      <input className="sr-only" aria-hidden="true" tabIndex={-1} required={required} type="datetime-local" value={value} onChange={e=>onChange(e.target.value)} onInvalid={e=>{e.preventDefault();setInvalid(true);setOpen(true);}}/>
      {open&&<div ref={popup} id={`${id}-calendar`} className="deadline-calendar" style={position} role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
        <div className="deadline-calendar-heading"><button type="button" className="icon-button" aria-label="Previous month" onClick={()=>setMonth(new Date(year,monthIndex-1,1))}><ChevronLeft size={19}/></button><h3 aria-live="polite">{monthName}</h3><button type="button" className="icon-button" aria-label="Next month" onClick={()=>setMonth(new Date(year,monthIndex+1,1))}><ChevronRight size={19}/></button></div>
        <div className="deadline-weekdays" aria-hidden="true">{['Mo','Tu','We','Th','Fr','Sa','Su'].map(day=><span key={day}>{day}</span>)}</div>
        <div ref={calendar} className="deadline-days">
          {Array.from({length:firstWeekday},(_,i)=><span key={`space-${i}`} aria-hidden="true"/>)}
          {Array.from({length:days},(_,i)=>{const day=i+1,key=`${year}-${String(monthIndex+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;return <button type="button" key={day} aria-label={new Date(year,monthIndex,day).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} aria-pressed={date===key} className={today===key?'is-today':''} onClick={()=>onChange(`${key}T${hour}:${minute}`)}>{day}</button>;})}
        </div>
        <div className="deadline-time"><span><Clock3 size={16}/>Time <small>24h</small></span><Select aria-label="Deadline hour" value={hour} onChange={e=>onChange(`${date||today}T${e.target.value}:${minute}`)}>{Array.from({length:24},(_,i)=>{const h=String(i).padStart(2,'0');return <option value={h} key={h}>{h}</option>;})}</Select><span>:</span><Select aria-label="Deadline minute" value={minute} onChange={e=>onChange(`${date||today}T${hour}:${e.target.value}`)}>{Array.from({length:60},(_,i)=>{const m=String(i).padStart(2,'0');return <option value={m} key={m}>{m}</option>;})}</Select></div>
        <div className="deadline-calendar-footer"><button className="text-link" type="button" onClick={()=>{setMonth(new Date(`${today.slice(0,7)}-01T00:00`));onChange(`${today}T${hour}:${minute}`);}}>Today</button>{!required&&value&&<button className="text-link" type="button" onClick={()=>onChange('')}>Clear</button>}<button className="button small" type="button" onClick={()=>{setOpen(false);trigger.current!.focus();}}>Done<Check size={15}/></button></div>
      </div>}
    </div>
    {hint&&<small id={`${id}-hint`}>{hint}</small>}
    {invalid&&!value&&<span className="deadline-error" role="alert">Choose {label.toLowerCase()} before continuing.</span>}
  </div>;
}
