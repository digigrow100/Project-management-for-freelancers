const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
function nodes(n){if(!n)return [];if(Array.isArray(n))return n.flatMap(nodes);if(typeof n!=='object')return [];return [n,...nodes(n.props?.children)];}
function text(n){if(n==null)return '';if(Array.isArray(n))return n.map(text).join('');if(typeof n!=='object')return String(n);return text(n.props?.children);}
function render(props){const jsx=(type,props)=>({type,props});const react={useState:v=>[typeof v==='function'?v():v,()=>{}],useMemo:f=>f(),useEffect:()=>{},useTransition:()=>[false,()=>{}]};const box={exports:{},require:n=>n==='react'?react:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:n==='next/link'?{default:'a'}:n==='next/navigation'?{useRouter:()=>({})}:n==='@/lib/taskDeferral'?{isScheduledFocus:s=>!!(s.availableOn||s.resumeAt||s.keepPending||s.resumeAfterCompletions),isFocusReady:(s,today)=>!s.keepPending&&!s.resumeAfterCompletions&&(!s.availableOn||s.availableOn<=today)&&(!s.resumeAt||Date.parse(s.resumeAt)<=Date.now())}:n==='@/lib/utils'?{cn:(...a)=>a.join(' '),formatDateKey:String}:new Proxy({},{get:()=>()=>null})};vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/MemberFocusDashboard.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,box);return box.exports.MemberFocusDashboard(props);}
const fixtures=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):[{name:'Maaz Ali',props:{projects:[{id:'p',name:'Site'}],tasks:[{id:'r',projectId:'p',title:'GSC cycle',status:'todo',priority:'medium',order:0,checklist:[],isFallback:false,fallbackTemplateKey:'review:gsc:1'}],moduleAssignments:[{projectId:'p',module:'gsc'}],focusStates:[],timeTotals:{}}}];
for(const fixture of fixtures){const props=fixture.props;props.focusStates??=[];const tree=render(props),all=nodes(tree);
 assert.match(text(tree),/tasks? left today/);
 const review=all.find(n=>n.type==='a'&&text(n)==='Open review details and findings');
 assert.ok(review,'the current review task must link to its project checklist');
 const task=props.tasks.find(t=>t.fallbackTemplateKey?.startsWith('review:')&&t.status!=='done');
 assert.equal(review.props.href,`/projects/${task.projectId}?seoTab=${task.fallbackTemplateKey.split(':')[1]}`);
 assert.ok(!all.some(n=>n.type==='a'&&n.props.href?.endsWith('=client')));
 console.log(`Passed: ${fixture.name}: daily task and project review link are available; client details are not linked.`);}
