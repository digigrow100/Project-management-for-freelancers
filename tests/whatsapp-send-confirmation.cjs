const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync('whatsapp-bridge-extension/content-whatsapp.js','utf8');
const code=source.slice(source.indexOf('  async function sendToChat'),source.indexOf('  function extractRecentInbound'));
class Element {click(){if(confirmSend)messages.push({direction:'outbound',body:composer.textContent,remoteMessageKey:'new-message'});}}
let confirmSend=true;let matches=true;let messages=[];let edits=0;const composer=new Element();composer.textContent='';
const box={HTMLElement:Element,busy:false,lastOpenedChatKey:'',openClient:async()=>{},composerBox:()=>composer,activeChatMatches:()=>matches,allMessageContainers:()=>messages,extractMessage:m=>m,setEditableText:(n,v)=>{edits++;n.textContent=v;},sleep:async()=>{},document:{querySelector:()=>new Element()}};
vm.runInNewContext(code,box);
(async()=>{
 let result=await box.sendToChat({chatKey:'target'},'Test');assert.equal(result.remoteMessageKey,'new-message');
 messages=[];confirmSend=false;await assert.rejects(()=>box.sendToChat({chatKey:'target'},'Test'),/Could not confirm/);
 matches=false;edits=0;await assert.rejects(()=>box.sendToChat({chatKey:'target'},'Test'),/not verified/);assert.equal(edits,0);
 assert.equal(box.busy,false);console.log('Passed: send acknowledgement requires a new outgoing message; unverified recipients cannot receive text.');
})().catch(e=>{console.error(e);process.exitCode=1;});
