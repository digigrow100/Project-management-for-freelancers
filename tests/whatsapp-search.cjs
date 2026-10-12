const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('whatsapp-bridge-extension/content-whatsapp.js','utf8');
const code=source.slice(source.indexOf('  function visibleSearchInput'),source.indexOf('  function composerBox'));
class Node {
  constructor({visible=true,compose=false,editable=true,child=null,label='',wrapper=null}={}){Object.assign(this,{visible,compose,editable,child,label,wrapper});}
  getClientRects(){return this.visible?[{}]:[];}
  closest(selector){return selector.includes('#main')?(this.compose?{}:null):this.wrapper;}
  matches(){return this.editable;}
  querySelector(){return this.child;}
  getAttribute(name){return name==='aria-label'?this.label:'';}
  getBoundingClientRect(){return {width:150,height:24,top:190,left:10};}
}
let map={},generic=[],chats=null;
const box={HTMLElement:Node,window:{innerWidth:1000},sleep:async()=>{},document:{querySelectorAll:s=>map[s]??(s==='input, textarea, [contenteditable="true"]'?generic:[]),querySelector:()=>chats}};
vm.runInNewContext(code,box);
const input=new Node();
map={'#side input':[new Node({visible:false}),input]};
assert.equal(box.searchBox(),input,'A hidden first match must not hide a visible input');
map={'[role="textbox"][aria-label*="Search" i]':[new Node({editable:false,child:input})]};
assert.equal(box.searchBox(),input,'Resolve wrapper to the editable element');
map={};generic=[new Node({compose:true}),input];
assert.equal(box.searchBox(),input,'Narrow sidebar layouts must work and composer must be excluded');
generic=[new Node({compose:true})];assert.equal(box.searchBox(),null);
generic=[];chats=new Node();chats.click=()=>{map={'#side input':[input]};};
(async()=>{assert.equal(await box.ensureSearchBox(),input,'Open Chats before retrying search');console.log('Passed: hidden inputs, nested textbox wrappers, narrow layouts, composer exclusion and Chats activation.');})().catch(e=>{console.error(e);process.exitCode=1;});
