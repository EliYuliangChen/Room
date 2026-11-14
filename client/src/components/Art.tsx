import type { CSSProperties } from 'react';
import manifest from '../lib/assets.json';
import type { AssetName } from '../lib/assets';
import { imageUrl } from '../lib/api';
export function Art({name,className,alt='',style}:{name:AssetName;className?:string;alt?:string;style?:CSSProperties}){
  const a=manifest[name],b=a.bounds;
  const stretch=['room-shell','whiteboard-blank','floor-rug'].includes(name);
  return <svg className={className} viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`} preserveAspectRatio={stretch?'none':'xMidYMid meet'} role={alt?'img':undefined} aria-label={alt||undefined} aria-hidden={!alt} style={style}><image href={a.path} width={a.width} height={a.height}/></svg>;
}
export function AvatarFigure({source,alt='',className}:{source:string;alt?:string;className?:string}){
  const known=Object.entries(manifest).find(([,a])=>a.path===source);
  return known?<Art name={known[0] as AssetName} alt={alt} className={className}/>:<img className={className} src={imageUrl(source)} alt={alt}/>;
}
