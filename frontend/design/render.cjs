/* Local Figma geometry extraction. No source document is uploaded. */
const fs = require('node:fs');
const path = require('node:path');
const doc = require('./decoded.json');
const nodes = doc.nodeChanges;
const key = g => g ? `${g.sessionID}:${g.localID}` : '';
const map = new Map(nodes.map(n => [key(n.guid), n]));
const childMap = new Map();
for (const n of nodes) { const k=key(n.parentIndex?.guid); if(!childMap.has(k))childMap.set(k,[]);childMap.get(k).push(n); }
for (const arr of childMap.values()) arr.sort((a,b)=>a.parentIndex.position < b.parentIndex.position ? -1 : 1);
const children = n => childMap.get(key(n.guid)) || [];
const num = n => Math.round(n * 10000) / 10000;
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function commands(index) {
  const b=Buffer.from(Object.values(doc.blobs[index].bytes)); let i=0, out='';
  const f=()=>{const v=b.readFloatLE(i);i+=4;return num(v);};
  while(i<b.length){const op=b[i++]; if(op===0)out+='Z';else if(op===1)out+=`M${f()} ${f()}`;else if(op===2)out+=`L${f()} ${f()}`;else if(op===3)out+=`Q${f()} ${f()} ${f()} ${f()}`;else if(op===4)out+=`C${f()} ${f()} ${f()} ${f()} ${f()} ${f()}`;else throw Error(`Path opcode ${op} in ${index}`);}
  return out.replace(/^Z+/, '');
}
const color=c=>c?`#${[c.r,c.g,c.b].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('')}`:'#000000';
const mat=t=>t?`matrix(${t.m00} ${t.m10} ${t.m01} ${t.m11} ${t.m02} ${t.m12})`:'';
const imageFiles={}; let seq=0;
const output=path.join(__dirname,'screens');fs.mkdirSync(output,{recursive:true});
const assetDir=path.join(__dirname,'../src/assets/images');fs.mkdirSync(assetDir,{recursive:true});
function imageData(p){const hash=Buffer.from(Object.values(p.image.hash)).toString('hex');const b=fs.readFileSync(path.join(__dirname,'source/images',hash));const ext=b[0]===0x89?'png':b[0]===0xff?'jpg':'webp';const name=hash+'.'+ext;if(!imageFiles[hash]){fs.copyFileSync(path.join(__dirname,'source/images',hash),path.join(assetDir,name));imageFiles[hash]=name;}return {hash,uri:`data:image/${ext==='jpg'?'jpeg':ext};base64,${b.toString('base64')}`,width:p.originalImageWidth,height:p.originalImageHeight};}
function shapes(n, glyph=false){return (n.fillGeometry||[]).map(g=>`<path d="${commands(g.commandsBlob)}" fill-rule="${g.windingRule==='ODD'?'evenodd':'nonzero'}"/>`).join('') || `<rect width="${n.size?.x||0}" height="${n.size?.y||0}" rx="${n.cornerRadius||0}"/>`;}
function paint(n,p,geometry){
  if(p.visible===false)return ''; const uid='p'+seq++;
  if(p.type==='SOLID')return `<g fill="${color(p.color)}" opacity="${(p.opacity??1)*(p.color?.a??1)}">${geometry}</g>`;
  if(p.type==='GRADIENT_LINEAR'||p.type==='GRADIENT_RADIAL'){
    const t=p.transform;const det=t.m00*t.m11-t.m01*t.m10;
    const inv=(x,y)=>({x:((x-t.m02)*t.m11-(y-t.m12)*t.m01)/det,y:((y-t.m12)*t.m00-(x-t.m02)*t.m10)/det});
    const a=inv(0,.5),b=inv(1,.5);
    return `<defs><linearGradient id="${uid}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}">${p.stops.map(s=>`<stop offset="${s.position}" stop-color="${color(s.color)}" stop-opacity="${s.color.a??1}"/>`).join('')}</linearGradient></defs><g fill="url(#${uid})" opacity="${p.opacity??1}">${geometry}</g>`;
  }
  if(p.type==='IMAGE'){
    const im=imageData(p), w=n.size.x,h=n.size.y;
    return `<defs><clipPath id="${uid}">${geometry}</clipPath></defs><image href="${im.uri}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid})" opacity="${p.opacity??1}"/>`;
  }return '';
}
function materialize(n,prefix=''){
  let kids=children(n);
  if(n.type==='INSTANCE'&&!kids.length){const source=map.get(key(n.symbolData?.symbolID));if(source)kids=children(source).map(c=>{
    const match=o=>key(o.guidPath?.guids.at(-1))===key(c.overrideKey||c.guid);
    return {...c,...n.symbolData.symbolOverrides?.find(match),...n.derivedSymbolData?.find(match)};
  });}
  return {...n,_key:prefix+key(n.guid),children:kids.map(c=>materialize(c,prefix+(n.type==='INSTANCE'?key(n.guid)+'/':'')))};
}
function render(n,root=false){
  if(n.visible===false||n.opacity===0)return '';
  let geometry='';
  if(n.type==='TEXT'){
    // One native path per label, rather than one view per glyph.
    const d=(n.derivedTextData?.glyphs||[]).map(g=>{
      let axis=0;return commands(g.commandsBlob).replace(/-?\d+(?:\.\d+)?/g,value=>{
        const x=axis++%2===0;return num((x?g.position.x:g.position.y)+Number(value)*g.fontSize*(x?1:-1));
      });
    }).join('');geometry=`<path d="${d}"/>`;
  }
  else geometry=shapes(n);
  let body=(n.fillPaints||[]).map(p=>paint(n,p,geometry)).join('');
  if(n.strokeGeometry?.length)body+=(n.strokePaints||[]).map(p=>paint(n,p,n.strokeGeometry.map(g=>`<path d="${commands(g.commandsBlob)}"/>`).join(''))).join('');
  if(n.type!=='BOOLEAN_OPERATION'){
    const maskIndex=n.children.findIndex(c=>c.mask);
    if(maskIndex>=0){const uid='m'+seq++;const mask=n.children[maskIndex];
      body+=n.children.slice(0,maskIndex).map(c=>render(c)).join('');
      body+=`<defs><mask id="${uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="${n.size.x}" height="${n.size.y}" style="mask-type:alpha">${render(mask)}</mask></defs><g mask="url(#${uid})">${n.children.slice(maskIndex+1).map(c=>render(c)).join('')}</g>`;
    }else body+=n.children.map(c=>render(c)).join('');
  }
  let clip='';if(n.type==='FRAME'&&!n.frameMaskDisabled){const uid='c'+seq++;body=`<defs><clipPath id="${uid}"><rect width="${n.size.x}" height="${n.size.y}" rx="${n.cornerRadius||0}"/></clipPath></defs><g clip-path="url(#${uid})">${body}</g>`;}
  return `<g opacity="${n.opacity??1}"${root?'':` transform="${mat(n.transform)}"`}>${body}</g>`;
}
const frames=nodes.filter(n=>key(n.parentIndex?.guid)==='0:1').map(n=>materialize(n));
for(const frame of frames){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">${render(frame,true)}</svg>`;fs.writeFileSync(path.join(output,`${frame.guid.localID}.svg`),svg);}
fs.writeFileSync(path.join(__dirname,'materialized.json'),JSON.stringify(frames));
fs.writeFileSync(path.join(assetDir,'../images.ts'),'// Extracted from the supplied Figma archive.\nexport const images: Record<string, number> = {\n'+Object.entries(imageFiles).map(([k,v])=>`  '${k}': require('./images/${v}'),`).join('\n')+'\n};\n');
console.log('Rendered',frames.length,'screens;',Object.keys(imageFiles).length,'original images.');
module.exports={frames,commands,color,render,paint,shapes};
