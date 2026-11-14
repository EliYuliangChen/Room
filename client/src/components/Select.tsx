import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
type Props=Omit<SelectHTMLAttributes<HTMLSelectElement>,'multiple'|'size'>;
const optionText=(node:ReactNode):string=>Children.toArray(node).map(child=>isValidElement(child)?optionText((child.props as {children?:ReactNode}).children):String(child)).join('');
// A real select retains form validation/change semantics; the visible list is
// drawn consistently instead of using each OS's different popup appearance.
export function Select(props:Props){
  const {children,value,disabled,className='',...rest}=props;
  const options=Children.toArray(children).filter(isValidElement).map(child=>{const p=child.props as {value?:string|number;children?:ReactNode;disabled?:boolean};return {value:String(p.value??optionText(p.children)),label:optionText(p.children),disabled:p.disabled};});
  const selected=options.findIndex(o=>o.value===String(value??''));
  const [open,setOpen]=useState(false),[active,setActive]=useState(Math.max(0,selected)),[position,setPosition]=useState({left:0,top:0,width:180,maxHeight:260});
  const button=useRef<HTMLButtonElement>(null),native=useRef<HTMLSelectElement>(null),list=useRef<HTMLDivElement>(null),id=useId();
  function place(){const r=button.current?.getBoundingClientRect();if(!r)return;const needed=Math.min(options.length*41+12,260),below=innerHeight-r.bottom-12;setPosition({left:Math.min(r.left,innerWidth-r.width-12),top:below<needed&&r.top>needed?r.top-needed-6:r.bottom+6,width:r.width,maxHeight:Math.max(100,Math.min(260,below<needed&&r.top>needed?r.top-12:below))});}
  useLayoutEffect(()=>{if(open)place();},[open]);
  useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!button.current?.contains(e.target as Node)&&!list.current?.contains(e.target as Node))setOpen(false);};const closeOthers=(e:Event)=>{if((e as CustomEvent).detail!==id)setOpen(false);};document.addEventListener('pointerdown',outside);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);window.addEventListener('project-room:select',closeOthers);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.removeEventListener('project-room:select',closeOthers);};},[open,id]);
  useEffect(()=>{list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({block:'nearest'});},[active,open]);
  function expand(){if(disabled)return;setActive(Math.max(0,selected));window.dispatchEvent(new CustomEvent('project-room:select',{detail:id}));setOpen(true);}
  function choose(index:number){if(options[index]?.disabled)return;const el=native.current;if(el){el.value=options[index].value;el.dispatchEvent(new Event('change',{bubbles:true}));}setOpen(false);button.current?.focus();}
  function move(direction:number){let next=active;for(let i=0;i<options.length;i++){next=(next+direction+options.length)%options.length;if(!options[next].disabled){setActive(next);break;}}}
  return <span className={`ink-select ${className}`}>
    <button ref={button} type="button" disabled={disabled} role="combobox" aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-expanded={open} aria-controls={`${id}-list`} aria-haspopup="listbox" aria-activedescendant={open?`${id}-${active}`:undefined} aria-required={props.required} onClick={()=>open?setOpen(false):expand()} onKeyDown={e=>{
      if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);return;}
      if(e.key==='Tab'){setOpen(false);return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(!open)expand();else if(e.key==='Home')setActive(options.findIndex(o=>!o.disabled));else if(e.key==='End')setActive(options.length-1-[...options].reverse().findIndex(o=>!o.disabled));else move(e.key==='ArrowDown'?1:-1);}
      if(e.key==='Enter'||e.key===' '){e.preventDefault();if(open)choose(active);else expand();}
      if(e.key.length===1&&e.key!==' '){const next=options.findIndex((o,i)=>i>active&&!o.disabled&&o.label.toLowerCase().startsWith(e.key.toLowerCase()));const fallback=options.findIndex(o=>!o.disabled&&o.label.toLowerCase().startsWith(e.key.toLowerCase()));if(!open)expand();setActive(next>=0?next:Math.max(0,fallback));}
    }}><span>{options[selected]?.label||options[0]?.label}</span><ChevronDown size={16}/></button>
    <select {...rest} ref={native} value={value} disabled={disabled} aria-hidden="true" tabIndex={-1} className="select-native" onInvalid={e=>{e.preventDefault();button.current?.focus();expand();}}>{children}</select>
    {open&&createPortal(<div ref={list} id={`${id}-list`} className="ink-options" role="listbox" aria-label={props['aria-label']} style={{position:'fixed',...position}}>{options.map((o,i)=><div id={`${id}-${i}`} key={o.value} data-index={i} role="option" aria-selected={selected===i} aria-disabled={o.disabled} className={`${i===active?'active':''} ${o.disabled?'disabled':''}`} onMouseEnter={()=>!o.disabled&&setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(i)}><span>{o.label}</span>{i===selected&&<Check size={16}/>}</div>)}</div>,document.body)}
  </span>;
}
