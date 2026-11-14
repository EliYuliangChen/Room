import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, LoaderCircle, LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { COPY } from '../lib/copy';
export function ErrorNote({ error }: { error?: string | null }) { return error ? <div className="error-note" role="alert">{error}</div> : null; }
export function Loading() { return <div className="loading" role="status"><LoaderCircle size={24}/>{COPY.loading}</div>; }
export function BackLink({ to='/projects', label=COPY.back }: { to?:string; label?:string }) { return <Link className="text-link back-link" to={to}><ArrowLeft size={18}/>{label}</Link>; }
export function Modal({ title, onClose, children, wide=false, variant }: { title:string; onClose:()=>void; children:ReactNode; wide?:boolean; variant?:'board'|'left'|'right'|'chat' }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button, input, a, select, textarea')?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], select:not([aria-hidden="true"]), textarea, [tabindex="0"]') ?? []).filter(node=>node.getAttribute('aria-hidden')!=='true'&&node.getClientRects().length>0);
        const first=nodes[0], last=nodes[nodes.length-1];
        if(e.shiftKey && document.activeElement===first) { e.preventDefault(); last?.focus(); }
        if(!e.shiftKey && document.activeElement===last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown',handler); return () => { document.body.style.overflow=bodyOverflow; document.removeEventListener('keydown',handler); before?.focus(); };
  }, []);
  return createPortal(<div className={`modal-backdrop ${variant?`overlay-${variant}`:''}`} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`modal sketch-panel ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}><div className="modal-header">{variant==='board'?<div className="planning-heading"><span className="planning-heading-icon"><LayoutDashboard size={25} aria-hidden="true"/></span><div><h2>{title}</h2><p>Set up stages, assign tasks and track progress</p></div></div>:<h2>{title}</h2>}<button className="icon-button" aria-label="Close dialog" onClick={onClose}><X/></button></div>{children}</div></div>,document.body);
}
