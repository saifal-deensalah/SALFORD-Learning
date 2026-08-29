const fs=require('node:fs');
process.chdir(require('node:path').resolve(__dirname, '..'));
const sharp=require('./tools/node_modules/sharp');
const rasterJobs=[];
const {frames,render,paint,shapes,color}=require('./render.cjs');
const svg=(n,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${n.size.x+4}" height="${n.size.y+4}" viewBox="-2 -2 ${n.size.x+4} ${n.size.y+4}">${body}</svg>`;
function convert(n,root=false){
  if(n.visible===false||n.opacity===0)return null;
  const s=n.size||{x:0,y:0},t=n.transform||{};
  const o={id:n._key,name:n.name,x:root?0:t.m02||0,y:root?0:t.m12||0,w:s.x,h:s.y,opacity:n.opacity??1};
  if([1120,1138,1164,2353,2397].includes(n.guid.localID))o.horizontal=true;
  if(n.type==='TEXT') {
    o.text=n.textData.characters;o.fontSize=n.fontSize;o.color=color(n.fillPaints?.[0]?.color);
    o.svg=svg(n,render({...n,opacity:1},true));
  }else if(n.guid.localID===2224){
    // Export this small alpha-mask asset. Native SVG image masks can render
    // before their decoded bitmap is ready on Android.
    o.image='success-seal';
    rasterJobs.push(sharp(Buffer.from(svg(n,render({...n,opacity:1},true)))).extract({left:2,top:2,width:84,height:84}).resize(252,252).png().toFile('src/assets/images/success-seal.png'));
  }else if([48,421,562,805].includes(n.guid.localID)||n.type==='VECTOR'||n.type==='BOOLEAN_OPERATION'){
    o.svg=svg(n,render({...n,opacity:1},true));
  }else{
    const fills=(n.fillPaints||[]).filter(p=>p.visible!==false);
    const im=fills.find(p=>p.type==='IMAGE');
    if(im)o.image=Buffer.from(Object.values(im.image.hash)).toString('hex');
    if(n.cornerRadius)o.radius=n.cornerRadius;
    if(n.type==='ELLIPSE')o.radius=Math.max(s.x,s.y)/2;
    if(n.type==='FRAME'&&!n.frameMaskDisabled)o.clip=true;
    const visual=fills.filter(p=>p.type!=='IMAGE');
    // Use primitive backgrounds for plain fills; preserve vectors for gradients/strokes.
    if(visual.length===1&&visual[0].type==='SOLID'&&n.type!=='ELLIPSE'&&!n.strokeGeometry?.length){
      const p=visual[0];o.background=`rgba(${[p.color.r,p.color.g,p.color.b].map(v=>Math.round(v*255)).join(',')},${(p.opacity??1)*(p.color.a??1)})`;
    }else if(visual.length||n.strokeGeometry?.length){o.svg=svg(n,render({...n,children:[],opacity:1,fillPaints:visual},true));}
    o.children=n.children.map(c=>convert(c)).filter(Boolean);
  }
  if(!root&&((t.m00??1)!==1||(t.m11??1)!==1||t.m01||t.m10))o.matrix=[t.m00,t.m10,t.m01,t.m11];
  return o;
}
fs.mkdirSync('src/design',{recursive:true});
const screens=Object.fromEntries(frames.map(f=>[String(f.guid.localID),convert(f,true)]));
// The second Home image was placed outside its carousel in the source.
// Reparent without changing its initial screen coordinates so it scrolls too.
const home=screens['1066'];const detached=home.children.find(n=>n.id==='1:1142');
const carousel=home.children.find(n=>n.id==='1:1130')?.children.find(n=>n.id==='1:1138');
if(detached&&carousel){home.children=home.children.filter(n=>n!==detached);carousel.children.unshift({...detached,x:222,y:3});}
fs.writeFileSync('src/design/screens.json',JSON.stringify(screens));
const manifest=frames.map(f=>({id:String(f.guid.localID),name:f.name,width:f.size.x,height:f.size.y}));
fs.writeFileSync('src/design/manifest.json',JSON.stringify(manifest,null,2));
console.log('Native scene data generated.');
Promise.all(rasterJobs).then(()=>{
  const file='src/assets/images.ts';fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('};',"  'success-seal': require('./images/success-seal.png'),\n};"));
}).catch(e=>{console.error(e);process.exitCode=1;});
