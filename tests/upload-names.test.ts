import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import request from 'supertest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PNG} from 'pngjs';
import {openStore,type Store} from '../server/src/db.js';
import {createApp} from '../server/src/app.js';

let directory:string,store:Store,app:ReturnType<typeof createApp>,owner:string,project:string,stage:string,task:string;
beforeEach(async()=>{
  directory=mkdtempSync(path.join(tmpdir(),'room-upload-names-'));store=await openStore(directory);app=createApp(store);
  owner=(await request(app).post('/api/demo-users').send({display_name:'Uploader'})).body.id;
  const p=(await request(app).post('/api/projects').set('x-demo-user-id',owner).send({name:'Unicode upload test',final_due_at:'2027-07-01T12:00:00Z',stages:[{title:'Research',tasks:[{title:'Evidence',subtasks:[]}]}]})).body;
  project=p.id;stage=p.stages[0].id;task=p.stages[0].tasks[0].id;
});
afterEach(()=>{store.close();rmSync(directory,{recursive:true,force:true});});

// Build the actual browser wire format: UTF-8 filename bytes without filename*.
function multipart(fields:Record<string,string>,field:string,name:string,bytes:Buffer,type:string,extended=false){
  const boundary='room-unicode-boundary';
  const parts:Buffer[]=Object.entries(fields).map(([key,value])=>Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; ${extended?`filename*=UTF-8''${encodeURIComponent(name)}`:`filename="${name}"`}\r\nContent-Type: ${type}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`));
  return {body:Buffer.concat(parts),type:`multipart/form-data; boundary=${boundary}`};
}

describe('Unicode filenames at every upload boundary',()=>{
  it('retains Chinese, mixed-language and emoji avatar labels after restart',async()=>{
    const name='头像 café 100% 🍩.png',bytes=PNG.sync.write(new PNG({width:4,height:4})),form=multipart({},'image',name,bytes,'image/png');
    const response=await request(app).post('/api/avatars/upload').set('x-demo-user-id',owner).set('Content-Type',form.type).send(form.body);
    expect(response.status,response.text).toBe(201);expect(response.body.label).toBe(name);
    store.close();store=await openStore(directory);app=createApp(store);
    expect((await request(app).get('/api/avatars').set('x-demo-user-id',owner)).body.find((a:{id:string})=>a.id===response.body.id).label).toBe(name);
    expect((await request(app).get(`/api/avatars/${response.body.id}/image`).set('x-demo-user-id',owner)).body).toEqual(bytes);
  });
  it('retains submission filenames and Unicode download headers without changing bytes',async()=>{
    store.transaction(()=>{store.run("UPDATE projects SET status='ongoing' WHERE id=?",[project]);store.run('UPDATE tasks SET assignee_user_id=? WHERE id=?',[owner,task]);});
    const name='亚纶_信噪比_烤鸭.pdf',bytes=Buffer.from('%PDF-1.4\nLocal evidence\n%%EOF'),form=multipart({},'files',name,bytes,'application/pdf');
    const response=await request(app).post(`/api/leaf-tasks/${task}/submissions`).set('x-demo-user-id',owner).set('Content-Type',form.type).send(form.body);
    expect(response.status,response.text).toBe(201);expect(response.body.submissions[0].files[0].original_name).toBe(name);
    const id=response.body.submissions[0].files[0].id;
    store.close();store=await openStore(directory);app=createApp(store);
    const file=await request(app).get(`/api/files/${id}/download`).set('x-demo-user-id',owner);
    expect(file.body).toEqual(bytes);expect(file.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
    expect(store.get('SELECT original_name FROM submission_files WHERE id=?',[id])).toEqual({original_name:name});
  });
  it.each([false,true])('retains resource filenames (explicit charset: %s), literal percent signs and downloads',async extended=>{
    const name='课堂笔记_café_100%_🍩.pdf',bytes=Buffer.from('%PDF-1.4\nShared resource\n%%EOF'),form=multipart({kind:'file',title:'Course notes',stage_id:stage},'file',name,bytes,'application/pdf',extended);
    const response=await request(app).post(`/api/projects/${project}/resources`).set('x-demo-user-id',owner).set('Content-Type',form.type).send(form.body);
    expect(response.status,response.text).toBe(201);
    store.close();store=await openStore(directory);app=createApp(store);
    const resource=(await request(app).get(`/api/projects/${project}/resources`).set('x-demo-user-id',owner)).body[0];expect(resource.original_name).toBe(name);
    const file=await request(app).get(`/api/files/${resource.id}/download`).set('x-demo-user-id',owner);
    expect(file.body).toEqual(bytes);expect(file.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
  });
});
