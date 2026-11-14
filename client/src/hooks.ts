import { useEffect, useState, type DependencyList } from 'react';
export function useLoad<T>(load:()=>Promise<T>,deps:DependencyList) {
  const [data,setData]=useState<T>(); const [error,setError]=useState(''); const [revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;setData(undefined);setError('');load().then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message||'Could not reach the local server.');});return()=>{active=false;};},[...deps,revision]);
  return {data,error,reload:()=>setRevision(v=>v+1)};
}
