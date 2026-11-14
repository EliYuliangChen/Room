import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { Resvg } from '@resvg/resvg-js';

// Generated layers are checked in. Rebuild the authored vector family and registry
// without needing an image service or altering any uploaded/legacy avatar bytes.
const base=path.resolve('client/public/assets/illustrations');
const dir=path.join(base,'phase3'); mkdirSync(dir,{recursive:true});
type Entry={path:string;width:number;height:number;bounds:{x:number;y:number;width:number;height:number};anchor:string;zIndex:number;decorative:boolean;status:string;nominalWidth?:number;nominalHeight?:number};
const registry:Record<string,Entry>={};
const wrap=(w:number,h:number,s:string)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" stroke="#302d28" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${s}</svg>`;
function vector(name:string,w:number,h:number,content:string,z=1){writeFileSync(path.join(dir,`${name}.svg`),wrap(w,h,content));registry[name]={path:`/assets/illustrations/phase3/${name}.svg`,width:w,height:h,bounds:{x:0,y:0,width:w,height:h},anchor:'bottom-center',zIndex:z,decorative:true,status:'crafted-vector'};}
function raster(name:string,file:string,z:number,decorative=true){const png=PNG.sync.read(readFileSync(path.join(dir,file)));let x=png.width,y=png.height,right=0,bottom=0,transparent=0;for(let row=0;row<png.height;row++)for(let col=0;col<png.width;col++){const alpha=png.data[(row*png.width+col)*4+3];if(alpha===0)transparent++;if(alpha>24){x=Math.min(x,col);y=Math.min(y,row);right=Math.max(right,col);bottom=Math.max(bottom,row);}}if(transparent/png.width/png.height<.1)throw new Error(`${file}: expected native transparency`);const pad=3;x=Math.max(0,x-pad);y=Math.max(0,y-pad);right=Math.min(png.width-1,right+pad);bottom=Math.min(png.height-1,bottom+pad);registry[name]={path:`/assets/illustrations/phase3/${file}`,width:png.width,height:png.height,bounds:{x,y,width:right-x+1,height:bottom-y+1},anchor:'bottom-center',zIndex:z,decorative,status:'generated-layer'};}
vector('room-shell',1200,650,'<path d="M3 22 115 80 1085 80 1197 22M115 80v377L3 530M1085 80v377l112 73M115 457h970" stroke="#a59b8b" stroke-width="1.1"/><path d="M115 462h970" stroke="#d4cbbc" stroke-width=".7"/>',0);
vector('floor-rug',1000,130,'<path d="M83 5 915 8 996 115 5 116Z" fill="#f3eee4" stroke="#c6baa7" stroke-width=".8"/><path d="M75 22H53m15 15H42m16 15H31m16 15H20m18 15H10m914-60h23m-14 15h24m-13 15h26m-14 15h26m-13 15h26" stroke="#c6baa7" stroke-width=".8"/>',1);
vector('whiteboard-blank',600,280,'<path d="M9 9Q290 4 589 10L591 267Q300 273 8 268Z" fill="#fffefa"/><path d="M16 17 581 18 582 258 17 259Z" stroke-width=".9"/><path d="M421 259v-9h47v9m23-2h38"/>',2);
vector('ceiling-lamp',150,150,'<path d="M74 0v59M18 115q8-57 56-56 49 0 58 56-53-14-114 0Z" fill="#fffdf8"/><path d="M23 114q54 15 103 0M61 120q14 17 28 0" stroke-width="1"/>',2);
vector('door-right',130,340,'<path d="M13 336V23L119 4v332M23 328V34L108 18v310M42 67l48-8v119l-48 6Z" fill="#fdfaf4"/><path d="m51 74 31-5v100l-31 4ZM84 230h15m-9-6v13"/>',1);
const plant='<path d="M65 177 62 37m2 126L26 78m38 70 41-62m-42 83-39-46m39 26 34-16"/><path d="M62 65Q37 32 59 5q28 21 3 60ZM38 106Q-2 93 9 59q35 8 29 47ZM79 114q-4-38 38-48 3 33-38 48ZM40 148q-37 0-37-34 32-4 37 34ZM80 153q5-32 40-36-4 35-40 36Z" fill="#aab79b"/><path d="M38 173q27-7 53 0l-8 49q-20 12-38 0Z" fill="#fffdf8"/><ellipse cx="64" cy="174" rx="26" ry="6"/>';
vector('plant-large',128,235,plant,2);vector('plant-small',128,235,plant,2);
vector('mug',60,55,'<path d="M9 15h33v26q-16 10-32 0ZM42 19q22-5 12 16-3 6-12 1M19 9q-8-6 0-9m13 9q-8-6 0-9" fill="#fffdf8"/>',6);
vector('notebook',90,40,'<path d="m5 8 57-5 22 23-61 10Z" fill="#eadcc8"/><path d="m6 13 18 26 60-8M12 9l22 23M24 9l15-1"/>',6);
vector('pencils',48,65,'<path d="M8 30h32l-4 30H13Z" fill="#fffdf8"/><path d="M17 29 11 3l5-1 6 27m4 0 2-26h5l-2 26M10 37h28"/>',6);
vector('sticky-note',130,115,'<path d="m9 16 109-8 8 92-105 9Z" fill="#f4e6cb" stroke-width="1.2"/><path d="m49 12 35-2 2 9-35 3Z" fill="#eee5d7" stroke="none"/><path d="m93 96 10 1-7 7" stroke-width="1"/>',2);
vector('clipboard',100,130,'<path d="M17 12h70v110H10V20Z" fill="#fffdf8"/><path d="M35 6h30v15H35ZM24 45h48M24 59h48M24 73h32M24 100l6 6 12-16"/>',2);
vector('doodle-spark',60,60,'<path d="m30 3 2 17L46 8 38 25l20 3-19 7 10 15-17-10-5 18-4-19L6 49l12-17L2 26l19-2-9-17 14 14Z" stroke-width="1.3"/>',2);
for(const [name,file,z] of [['desk-top','desk.png',5],['chair','chair.png',3],['laptop-front','laptop.png',6],['bookshelf-files','bookshelf.png',2],['submit-tray-sign','cabinet.png',2]] as const)raster(name,file,z);
raster('cat','cat.png',4,false);raster('donut','donut.png',4,false);
// Pencil stays crisp vector artwork: generated candidate had an unwanted halo.
const pencil='<g transform="rotate(10 100 120)"><path d="M75 185V51h50v134Z" fill="#ebc365"/><path d="m75 51 25-45 25 45Z" fill="#e8d6b5"/><path d="m91 22 9-16 9 16Z" fill="#302d28"/><path d="M75 183h50v18q-24 20-50 0Z" fill="#e6aeb3"/><path d="M75 177h50v14H75Z" fill="#d9d6ce"/><path d="M85 57v100m30-100v100" stroke="#bd964c" stroke-width="1"/><circle cx="91" cy="108" r="3" fill="#302d28"/><circle cx="111" cy="108" r="3" fill="#302d28"/><path d="M91 122q10 12 20 0"/></g>';
writeFileSync(path.join(dir,'pencil.png'),new Resvg(wrap(200,230,pencil)).render().asPng());raster('pencil','pencil.png',4,false);registry.pencil.status='crafted-vector-png';
// Four distinct room arrangements, using a shared perspective and stroke family.
const shell='<path d="M4 9 42 31h474l40-24M42 31v196h474V31M42 227 6 257m510-30 39 30" stroke="#9f9688" stroke-width="1"/>';
const desk=(x:number,y:number,w=220)=>`<g transform="translate(${x} ${y})"><path d="M13 0h${w-27}l14 28H0Z" fill="#fffdf8"/><path d="M0 28v5h${w}v-5M15 33l-6 83m${w-25}-83 7 83"/><path d="M${w/2-33} 5v-42h64v42Z" fill="#e8e4dd"/><path d="M${w/2-36} 5h73"/></g>`;
const chair=(x:number,y:number)=>`<g transform="translate(${x} ${y})"><path d="M0 0q35-8 70 0v45H0Z" fill="#fffdf8"/><path d="M-4 45h78v9H-4ZM35 54v30m-25 8 25-8 25 8m-25-7v13"/><circle cx="8" cy="92" r="3"/><circle cx="62" cy="92" r="3"/></g>`;
const bookcase=(x:number)=>`<g transform="translate(${x} 94)"><path d="M0 0h75v141H0Z" fill="#fffdf8"/><path d="M0 38h75M0 83h75M0 117h75M9 6v25h9V6Zm15 0v25h10V6Zm17 1 7 24 11-3-7-24ZM8 48v27h12V48Zm17-1v28h12V47Zm20 1 7 27 10-4-7-26M29 97h16M29 129h16"/></g>`;
const smallPlant=(x:number,y:number,scale=.45)=>`<g transform="translate(${x} ${y}) scale(${scale})">${plant}</g>`;
const board=(x:number,y:number,w=160)=>`<path d="M${x} ${y}h${w}v81H${x}Z" fill="#fffefa"/><path d="M${x+5} ${y+5}h${w-10}v71H${x+5}Z" stroke-width=".8"/>`;
const lamp=(x:number)=>`<path d="M${x} 0v53m-31 28q4-29 31-28 27-1 31 28Z" fill="#fffdf8"/>`;
const variants=[
`${board(180,58,190)}${lamp(270)}${bookcase(62)}${smallPlant(439,120)}${chair(170,149)}${chair(320,149)}<ellipse cx="280" cy="203" rx="138" ry="34" fill="#fffdf8"/><path d="m185 220-10 52m196-52 10 52m-101-35v35"/><path d="m244 191 58-3 17 15-59 4Z" fill="#e4e0d7"/>`,
`${board(230,55,160)}${lamp(188)}${lamp(406)}${bookcase(63)}${smallPlant(465,134,.4)}${chair(195,126)}${chair(360,126)}${desk(157,178,155)}${desk(326,178,155)}`,
`${board(83,61,180)}<circle cx="391" cy="70" r="21"/><path d="m391 57 0 13 11 6"/>${bookcase(435)}${smallPlant(61,132,.46)}${chair(220,143)}<ellipse cx="274" cy="204" rx="108" ry="30" fill="#fffdf8"/><path d="m206 222-16 48m152-48 15 48m-79-40v40"/><path d="M247 192v-40h57v40Zm-3 0h65" fill="#e8e4dd"/>${lamp(298)}`,
`${bookcase(66)}${smallPlant(424,123)}${board(326,62,107)}${lamp(262)}<path d="M174 65h67v55h-67Zm6 8h16v16h-16Zm24 0h17v16h-17Zm-24 24h17v15h-17Z" fill="#eee3cf"/>${chair(247,128)}${desk(182,182,210)}`
];
variants.forEach((s,i)=>vector(`office-0${i+1}`,560,300,shell+s,0));
const nominal:Record<string,[number,number]>={'desk-top':[495,134],chair:[124,204],'laptop-front':[110,66],'bookshelf-files':[122,260],'submit-tray-sign':[119,177],cat:[152,156],pencil:[152,156],donut:[152,156]};
for(const [key,a] of Object.entries(registry)){[a.nominalWidth,a.nominalHeight]=nominal[key]||[a.width,a.height];if(key.startsWith('office-'))a.anchor='center';}
writeFileSync(path.resolve('client/src/lib/assets.json'),JSON.stringify(registry,null,2)+'\n');
console.log(`Built ${Object.keys(registry).length} replaceable Phase 3 assets; PNG bytes kept intact.`);
