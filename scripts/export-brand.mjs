import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const sharp=require(createRequire(require.resolve('next/package.json')).resolve('sharp'));
const root=path.resolve(import.meta.dirname,'..');
const brand=path.join(root,'public/brand');
const web=path.join(root,'apps/web/public');
await mkdir(path.join(web,'brand'),{recursive:true});
await mkdir(path.join(root,'build'),{recursive:true});
const icon=await readFile(path.join(brand,'heis-app-icon-crimson.svg'));
const sizes=[16,24,32,48,64,128,180,192,256,512,1024];
const images=new Map();
for(const size of sizes){
 const png=await sharp(icon).resize(size,size).png().toBuffer();images.set(size,png);
 await writeFile(path.join(brand,`heis-icon-${size}.png`),png);
}
for(const theme of ['light','dark']){
 await sharp(path.join(brand,`heis-wordmark-${theme}.svg`)).resize({height:400}).png().toFile(path.join(brand,`heis-wordmark-${theme}.png`));
 await sharp(path.join(brand,`heis-symbol-${theme}.svg`)).resize({height:512}).png().toFile(path.join(brand,`heis-symbol-${theme}.png`));
}
await writeFile(path.join(brand,'heis-app-icon-1024.png'),images.get(1024));
await sharp(path.join(brand,'heis-social.svg')).png().toFile(path.join(brand,'heis-social.png'));
for(const size of [192,512])await sharp(path.join(brand,'heis-maskable.svg')).resize(size,size).png().toFile(path.join(brand,`heis-maskable-${size}.png`));
// ICO container with PNG entries, including crisp small sizes and a 256px image.
const icoSizes=[16,32,48,64,128,256];
const header=Buffer.alloc(6+16*icoSizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(icoSizes.length,4);
let offset=header.length;
for(const [i,size] of icoSizes.entries()){
 const start=6+i*16;header[start]=header[start+1]=size===256?0:size;
 header.writeUInt16LE(1,start+4);header.writeUInt16LE(32,start+6);
 header.writeUInt32LE(images.get(size).length,start+8);header.writeUInt32LE(offset,start+12);offset+=images.get(size).length;
}
const ico=Buffer.concat([header,...icoSizes.map(s=>images.get(s))]);
await writeFile(path.join(root,'public/favicon.ico'),ico);
await writeFile(path.join(root,'build/heis.ico'),ico);
await copyFile(path.join(brand,'heis-favicon.svg'),path.join(root,'public/favicon.svg'));
await writeFile(path.join(root,'public/apple-touch-icon.png'),images.get(180));
await writeFile(path.join(root,'build/heis.png'),images.get(1024));
if(process.platform==='darwin'){
 const temp=await mkdtemp(path.join(tmpdir(),'heis-iconset-'));
 try{
  const set=path.join(temp,'Heis.iconset');await mkdir(set);
  for(const size of [16,32,128,256,512])for(const scale of [1,2]){
   const png=images.get(size*scale)??await sharp(icon).resize(size*scale,size*scale).png().toBuffer();
   await writeFile(path.join(set,`icon_${size}x${size}${scale===2?'@2x':''}.png`),png);
  }
  execFileSync('iconutil',['-c','icns',set,'-o',path.join(root,'build/heis.icns')]);
 }finally{await rm(temp,{recursive:true,force:true});}
}
const manifest={name:'Heis',short_name:'Heis',description:'Your creative workspace.',start_url:'/',display:'standalone',background_color:'#101113',theme_color:'#ac2430',icons:[...[192,512].map(size=>({src:`/brand/heis-icon-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'any'})),...[192,512].map(size=>({src:`/brand/heis-maskable-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'maskable'}))]};
await writeFile(path.join(root,'public/site.webmanifest'),JSON.stringify(manifest,null,2)+'\n');
for(const file of ['favicon.ico','favicon.svg','apple-touch-icon.png','site.webmanifest'])await copyFile(path.join(root,'public',file),path.join(web,file));
for(const file of ['heis-wordmark-light.svg','heis-wordmark-dark.svg','heis-symbol-light.svg','heis-symbol-dark.svg','heis-social.png','heis-icon-192.png','heis-icon-512.png','heis-maskable-192.png','heis-maskable-512.png'])await copyFile(path.join(brand,file),path.join(web,'brand',file));
console.log('Exported themed SVG/PNG logos, icons, ICO, ICNS, manifest, social image, and hosted web assets.');
