import {describe,expect,it} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {PNG} from 'pngjs';
import {PRESETS} from '../shared/types.js';
import {PRESET_PATHS} from '../shared/presets.js';
type Asset={path:string;width:number;height:number;decorative:boolean;bounds:{x:number;y:number;width:number;height:number}};
const registry=JSON.parse(readFileSync(path.resolve('client/src/lib/assets.json'),'utf8')) as Record<string,Asset>;
const publicRoot=path.resolve('client/public');
describe('Shipped illustration integrity and saved-avatar compatibility',()=>{
  it('ships every registry file with valid dimensions, native PNG alpha and bounded subjects',()=>{
    for(const asset of Object.values(registry)){
      const file=path.join(publicRoot,asset.path);expect(existsSync(file),asset.path).toBe(true);
      expect(asset.bounds.width).toBeGreaterThan(0);expect(asset.bounds.height).toBeGreaterThan(0);
      expect(asset.bounds.x+asset.bounds.width).toBeLessThanOrEqual(asset.width);
      expect(asset.bounds.y+asset.bounds.height).toBeLessThanOrEqual(asset.height);
      if(file.endsWith('.png')){const png=PNG.sync.read(readFileSync(file));expect([png.width,png.height]).toEqual([asset.width,asset.height]);let clear=0;for(let i=3;i<png.data.length;i+=4)if(png.data[i]===0)clear++;expect(clear/(png.width*png.height)).toBeGreaterThan(.1);}
    }
  });
  it('uses the same artwork in preset previews and newly persisted avatar records',()=>{
    for(const name of PRESETS){expect(registry[name].path).toBe(PRESET_PATHS[name]);expect(registry[name].decorative).toBe(false);}
  });
  it('retains all legacy PNG paths while shipping four distinct text-free office thumbnails',()=>{
    for(const name of PRESETS){const legacy=path.join(publicRoot,`assets/illustrations/avatar-presets/${name}.png`);expect(PNG.sync.read(readFileSync(legacy)).width).toBeGreaterThan(0);}
    const offices=['office-01','office-02','office-03','office-04'] as const;
    const sources=offices.map(name=>readFileSync(path.join(publicRoot,registry[name].path),'utf8'));
    expect(new Set(sources).size).toBe(4);for(const svg of sources)expect(svg).not.toContain('<text');
  });
});
