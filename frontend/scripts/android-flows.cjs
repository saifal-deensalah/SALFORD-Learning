// End-to-end checks on the installed LOCAL DEMO only. No real accounts/payments.
process.chdir(require('node:path').resolve(__dirname, '..'));
const fs=require('node:fs'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile),adb=async args=>(await run('adb',args,{encoding:'utf8',maxBuffer:5e6})).stdout;
const delay=ms=>new Promise(r=>setTimeout(r,ms));let xml='';const verifyRestart=process.argv.includes('--verify-restart');const resume=process.argv.includes('--resume')||verifyRestart;const results=resume&&fs.existsSync('artifacts/flow-checks.json')?JSON.parse(fs.readFileSync('artifacts/flow-checks.json','utf8')).filter(r=>r.passed):[];
async function dismissKeyboard(){const s=await adb(['shell','dumpsys','input_method']);if(/mInputShown=true|mIsInputViewShown=true/.test(s)){await adb(['shell','input','keyevent','4']);await delay(500);}}
async function observe(){await adb(['shell','uiautomator','dump','/sdcard/salford-flow.xml']);xml=await adb(['exec-out','cat','/sdcard/salford-flow.xml']);return xml;}
function attrs(tag){return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));}
async function tap(attr,value){await observe();const nodes=[...xml.matchAll(/<node\b[^>]+/g)].map(m=>attrs(m[0]));const node=nodes.reverse().find(n=>n[attr]?.toLowerCase()===value.toLowerCase()&&n.enabled==='true');if(!node)throw Error(`Missing ${attr}=${value}`);
const [x1,y1,x2,y2]=node.bounds.match(/\d+/g).map(Number);if(x2<=x1||y2<=y1)throw Error(`Offscreen ${value}`);await adb(['shell','input','tap',String(Math.round((x1+x2)/2)),String(Math.round((y1+y2)/2))]);await delay(450);}
const tapId=id=>tap('resource-id',`node-${id}`),tapLabel=label=>tap('content-desc',label);
async function screen(id){for(let i=0;i<10;i++){await observe();if(xml.includes(`resource-id="screen-${id}"`)){await delay(650);return;}await delay(1000);}throw Error(`Expected screen ${id}`);}
async function open(id){await adb(['shell','am','start','-a','android.intent.action.VIEW','-d',`salford://preview/${id}`,'com.cscapp']);await delay(1000);await screen(id);}
function pass(name){results.push({name,passed:true});console.log('PASS',name);fs.writeFileSync('artifacts/flow-checks.json',JSON.stringify(results,null,2));}
(async()=>{
 if(verifyRestart){await open('2314');await tapId('1:2424');await observe();if(!xml.includes('UI Design Wit Figma'))throw Error('Bookmark was not restored');pass('Bookmarks persist after process restart');await tapLabel('Close panel');await open('1066');return;}
 if(!resume){
 await open('47');await tapId('1:419');await screen('420');await tapId('1:559');await screen('561');await tapId('1:802');await screen('804');await tapId('1:817');await screen('818');pass('Onboarding -> Login');
 await tapId('1:893');await tap('text','OK');
 await tap('resource-id','input-email');await adb(['shell','input','text','learner@example.com']);
 await tap('resource-id','input-password');await adb(['shell','input','text','DemoPass123']);await dismissKeyboard();
 await tapId('1:893');await tap('text','CONTINUE DEMO');await screen('1066');pass('Credential validation and explicit demo login');
 }else{await open('1066');}
 await tapId('1:1100');await screen('1189');await tap('resource-id','course-search');await adb(['shell','input','text','figma']);await delay(800);
 await tapLabel('Save UI Design Wit Figma');await tapLabel('Open UI Design Wit Figma');await screen('1345');pass('Live search, bookmarking and course details');
 await tapId('1:1399');await screen('2231');await tapId('1:2272');await delay(22000);await tapLabel('Open navigation');await screen('2314');await tapId('1:2429');await screen('1824');
 await tapId('1:1864');await observe();if(!xml.includes('Demo completion certificate'))throw Error('No completed lesson certificate');await tapLabel('Close panel');pass('Native local video completion, saved progress and certificate');
 await tapId('1:1869');await tap('text','Subscription');await screen('1874');await tapId('1:1899');await tapId('1:1949');await tap('text','OK');await screen('1951');
 await tapLabel('Fill test payment details');await tapId('1:2085');await screen('2086');await tapId('1:2229');await screen('1479');pass('Plan selection -> test checkout -> success -> courses');
 await adb(['shell','am','force-stop','com.cscapp']);await adb(['shell','am','start','-n','com.cscapp/.MainActivity']);await delay(8000);await open('2314');await tapId('1:2424');await observe();if(!xml.includes('UI Design Wit Figma'))throw Error('Bookmark was not restored');pass('Bookmarks persist after process restart');
 await tapLabel('Close panel');await open('1066');
})().catch(e=>{results.push({passed:false,error:e.message});fs.writeFileSync('artifacts/flow-checks.json',JSON.stringify(results,null,2));console.error(e.message);process.exitCode=1;});
