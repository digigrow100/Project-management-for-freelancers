const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
const hooks=[];let index=0;let pending=[];const requests=[];
const react={useState(initial){const slot=index++;if(!(slot in hooks))hooks[slot]=typeof initial==='function'?initial():initial;return [hooks[slot],value=>{hooks[slot]=typeof value==='function'?value(hooks[slot]):value;}];},useRef(initial){const slot=index++;return hooks[slot]??(hooks[slot]={current:initial});},useMemo(fn){index++;return fn();},useEffect(){index++;},useTransition(){index++;return [false,fn=>pending.push(fn())];}};
const jsx=(type,props)=>({type,props});
const box={exports:{},window:{setTimeout:fn=>{fn();return 1;}},fetch:async(url,options)=>{if(options?.method==='POST'){requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:'scan'})};}return {ok:true,json:async()=>({status:'done',result:{chats:[]}})};},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('manifest.json')?{default:{version:'1.3.6'}}:name==='@/lib/utils'?{cn:(...a)=>a.join(' ')}:new Proxy({},{get:()=>()=>null})};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/WhatsAppBridgeManager.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,box);
const props={clients:[],members:[],initialLinks:[],initialSavedChats:[],initialHealth:{state:'online'}};
function render(){index=0;return box.exports.WhatsAppBridgeManager(props);}
function nodes(tree){if(!tree)return [];if(Array.isArray(tree))return tree.flatMap(nodes);if(typeof tree!=='object')return [];return [tree,...nodes(tree.props?.children)];}
function text(tree){if(tree==null)return '';if(Array.isArray(tree))return tree.map(text).join('');if(typeof tree!=='object')return String(tree);return text(tree.props?.children);}
(async()=>{
 let tree=render();nodes(tree).find(n=>n.type==='button'&&text(n).includes('My WhatsApp Chats')).props.onClick();
 tree=render();let input=nodes(tree).find(n=>n.props?.placeholder==='Search WhatsApp name…');input.props.onChange({target:{value:'Hamza Telenor'}});
 tree=render();input=nodes(tree).find(n=>n.props?.placeholder==='Search WhatsApp name…');let prevented=false;
 input.props.onKeyDown({key:'Enter',preventDefault(){prevented=true;}});
 const busy=render();assert.equal(nodes(busy).find(n=>n.type==='button'&&text(n)==='Working…').props.disabled,true);
 await Promise.all(pending);assert.equal(prevented,true);assert.equal(requests.length,1);assert.equal(requests[0].query,'Hamza Telenor');
 tree=render();assert.ok(text(tree).includes('No matching contacts found in WhatsApp.'));
 console.log('Passed: My Chats Enter starts the actual scan, stays disabled while awaiting response and shows empty results.');
})().catch(e=>{console.error(e);process.exitCode=1;});
