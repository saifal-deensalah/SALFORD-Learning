const fs=require('node:fs');
const d=require('./decoded.json'), nodes=d.nodeChanges;
const id=g=>g?`${g.sessionID}:${g.localID}`:'';
const children=g=>nodes.filter(n=>id(n.parentIndex?.guid)===id(g)).sort((a,b)=>a.parentIndex.position.localeCompare(b.parentIndex.position));
const frames=nodes.filter(n=>id(n.parentIndex?.guid)==='0:1');
function tree(n,depth=0){ return {id:id(n.guid),name:n.name,type:n.type,size:n.size,xy:[n.transform?.m02,n.transform?.m12],...(n.textData?{text:n.textData.characters,font:n.fontName,fontSize:n.fontSize}:{}),...(n.symbolData?{symbolData:n.symbolData}:{}),children:children(n.guid).map(c=>tree(c,depth+1))}; }
fs.writeFileSync(__dirname+'/tree.json',JSON.stringify(frames.map(n=>tree(n)),null,2));
console.log(frames.map(n=>({id:id(n.guid),name:n.name,type:n.type,size:n.size,children:children(n.guid).length})));
console.log('fonts', [...new Set(nodes.filter(n=>n.fontName).map(n=>JSON.stringify(n.fontName)))]);
console.log('prototype',nodes.filter(n=>n.reactions?.length||n.prototypeInteractions?.length).length);
