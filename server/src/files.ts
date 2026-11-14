import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import { ApiError } from './errors.js';
const types:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.pdf':'application/pdf','.txt':'text/plain','.md':'text/plain','.csv':'text/csv','.zip':'application/zip','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
export function saveFiles(directory:string,files:Express.Multer.File[]) {
  const saved:{id:string;original_name:string;stored_name:string;mime_type:string;byte_size:number}[]=[];
  try {
    for(const file of files){const ext=path.extname(file.originalname).toLowerCase(),mime=types[ext],b=file.buffer;
      if(!mime)throw new ApiError(400,'Supported files: PNG, JPEG, PDF, TXT, MD, CSV, ZIP, DOCX, PPTX and XLSX.');
      if(!b.length)throw new ApiError(400,'Empty files cannot be submitted.');
      if(ext==='.pdf'&&b.toString('ascii',0,5)!=='%PDF-')throw new ApiError(400,'This file is not a PDF.');
      if(ext==='.png'&&!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new ApiError(400,'This file is not a PNG.');
      if(['.zip','.docx','.pptx','.xlsx'].includes(ext)&&b.toString('ascii',0,2)!=='PK')throw new ApiError(400,'This file is not a supported ZIP-based document.');
      if(['.jpg','.jpeg'].includes(ext)&&!(b[0]===255&&b[1]===216&&b[2]===255))throw new ApiError(400,'This file is not a JPEG.');
      if(['.txt','.md','.csv'].includes(ext)&&b.includes(0))throw new ApiError(400,'Choose a text file without binary content.');
      const id=randomUUID(),stored_name=`${id}${ext}`;
      writeFileSync(path.join(directory,stored_name),b,{flag:'wx'});
      saved.push({id,original_name:path.basename(file.originalname).slice(0,180),stored_name,mime_type:mime,byte_size:b.length});
    }
    return saved;
  }catch(e){cleanupFiles(directory,saved);throw e;}
}
export function cleanupFiles(directory:string,files:{stored_name:string}[]) {for(const f of files)try{unlinkSync(path.join(directory,f.stored_name));}catch{/* Preserve original error. */}}
