const fs=require('node:fs');const {execFile}=require('node:child_process');const {promisify}=require('node:util');
process.chdir(require('node:path').resolve(__dirname, '..'));
const run=promisify(execFile),sharp=require('../design/tools/node_modules/sharp');
const ids=process.argv.slice(2);const screens=require('../src/design/manifest.json').filter(f=>!ids.length||ids.includes(f.id));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const adb=async args=>(await run('adb',args,{maxBuffer:25*1024*1024,encoding:'buffer'})).stdout;
(async()=>{
 fs.mkdirSync('artifacts/screenshots',{recursive:true});const report=[];
 for(const f of screens){
   await adb(['shell','am','start','-a','android.intent.action.VIEW','-d',`salford://preview/${f.id}`,'com.cscapp']);await delay(f.id==='37'?400:1800);
   if(f.id!=='37'){await adb(['shell','uiautomator','dump','/sdcard/salford-qa.xml']);const xml=(await adb(['exec-out','cat','/sdcard/salford-qa.xml'])).toString();
     fs.writeFileSync(`artifacts/screenshots/${f.id}.xml`,xml);const ok=xml.includes(`resource-id="screen-${f.id}"`);report.push({id:f.id,name:f.name,rendered:ok});console.log(f.id,f.name,ok?'OK':'CHECK');
   }
   await delay(f.id==='37'?0:1500);
   const b=await adb(['exec-out','screencap','-p']);fs.writeFileSync(`artifacts/screenshots/${f.id}-native.png`,b);
   await sharp(b).resize({width:390}).png().toFile(`artifacts/screenshots/${f.id}.png`);
 }
 fs.writeFileSync('artifacts/screen-checks.json',JSON.stringify(report,null,2));
 const inputs=await Promise.all(screens.map(async(f,i)=>({input:await sharp(`artifacts/screenshots/${f.id}.png`).resize({width:195}).toBuffer(),left:(i%6)*205,top:Math.floor(i/6)*450})));
 await sharp({create:{width:1230,height:Math.ceil(screens.length/6)*450,channels:4,background:'#D5D5D5'}}).composite(inputs).png().toFile('artifacts/android-contact-sheet.png');
 if(report.some(r=>!r.rendered))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
