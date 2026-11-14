import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// Separate module contexts model tabs sharing localStorage but not sessionStorage.
// This tests the browser client boundary without adding a DOM test dependency.
const source=ts.transpileModule(readFileSync(path.resolve('client/src/lib/api.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const storage=(values=new Map<string,string>())=>({getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}});
type Client={getIdentity:()=>string;setIdentity:(id:string)=>void;api:{session:()=>Promise<unknown>;sendChat:(project:string,body:string)=>Promise<{id:string}>;submit:(task:string,body:FormData)=>Promise<unknown>;review:(submission:string,decision:string,note:string)=>Promise<unknown>;readChat:(project:string)=>Promise<unknown>}};
function tab(localStorage:ReturnType<typeof storage>,sessionStorage=storage()){
  const requests:{url:string;user:string|null}[]=[],signals:string[]=[],response={status:200,body:{id:'message-1'} as Record<string,unknown>};
  const fetch=vi.fn(async(url:string,init:RequestInit)=>{requests.push({url,user:new Headers(init.headers).get('x-demo-user-id')});return new Response(JSON.stringify(response.status===200?response.body:{error:'Save failed'}),{status:response.status});});
  const exports={};
  runInNewContext(source,{exports,localStorage,sessionStorage,Headers,FormData,fetch,BroadcastChannel:class{constructor(public name:string){}postMessage(project:string){signals.push(project);}}});
  return {client:exports as Client,sessionStorage,requests,signals,response};
}
describe('Same-browser demo profile tabs and activity updates',()=>{
  it('signals saved submissions and review results to other local tabs',async()=>{
    const t=tab(storage());t.client.setIdentity('Alex');t.response.body={id:'leaf-1',project_id:'project-1'};
    await t.client.api.submit('leaf-1',new FormData());
    await t.client.api.review('version-1','request_changes','Please revise the evidence.');
    expect(t.signals).toEqual(['project-1','project-1']);
    t.response.status=500;await expect(t.client.api.review('version-1','approve','')).rejects.toThrow('Save failed');
    expect(t.signals).toEqual(['project-1','project-1']);
  });
  it('retains each tab identity across another tab switching and across reloads',async()=>{
    const shared=storage();shared.setItem('project-room.user','Alex');
    const a=tab(shared),b=tab(shared);b.client.setIdentity('Jamie');
    expect(a.client.getIdentity()).toBe('Alex');expect(b.client.getIdentity()).toBe('Jamie');
    const reloadedA=tab(shared,a.sessionStorage),reloadedB=tab(shared,b.sessionStorage);
    await reloadedA.client.api.session();await reloadedB.client.api.session();
    expect(reloadedA.requests[0].user).toBe('Alex');expect(reloadedB.requests[0].user).toBe('Jamie');
    expect(tab(shared).client.getIdentity()).toBe('Jamie');
  });
  it('signals another tab only after a message saves, and never rebroadcasts read receipts or failures',async()=>{
    const t=tab(storage());t.client.setIdentity('Alex');
    await expect(t.client.api.sendChat('project-1','Hello')).resolves.toEqual({id:'message-1'});
    expect(t.signals).toEqual(['project-1']);
    await t.client.api.readChat('project-1');expect(t.signals).toEqual(['project-1']);
    t.response.status=500;await expect(t.client.api.sendChat('project-1','Not saved')).rejects.toThrow('Save failed');
    expect(t.signals).toEqual(['project-1']);
  });
});
