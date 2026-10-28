const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const React=require('react');
global.React=React;
const state={host:'web.housemysite.com',profile:{id:'member-fixture',role:'member'},customer:false,reads:0};
global.__loginRouting=state;
const fixture=`const s=globalThis.__loginRouting;
export const headers=()=>new Headers({host:s.host});
export const redirect=(path)=>{throw new Error('redirect:'+path)};
export const getCurrentProfile=async()=>{if(s.customer)throw new Error('redirect:/client');return s.profile};
export const MemberFocusDashboard=()=>null;
export const ensureIdleSeoTaskForMember=async()=>{s.reads++};
export const getMyTasks=async()=>[];
export const getTaskFocusStates=async()=>[];
export const getEmployeeActivitySummary=async()=>({});
export const listMemberSeoModuleAssignments=async()=>[];
export const getProjectsForProfile=async()=>[];
export const getTaskTimeTotals=async()=>[];`;
async function load(){
 const result=await build({entryPoints:[path.join(__dirname,'../app/(app)/page.tsx')],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',tsconfig:path.join(__dirname,'../tsconfig.json'),plugins:[{name:'login-fixture',setup(b){
 b.onResolve({filter:/^(next\/headers|next\/navigation|@\/lib\/auth|@\/components\/MemberFocusDashboard|@\/lib\/employeeActivity|@\/lib\/store)$/},()=>({path:'fixture',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'ts'}));
 }}]});
 const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,mod,mod.exports);return mod.exports.default;
}
test('actual root keeps team members on their dashboard, routes admins by host, and preserves customer redirect',async()=>{
 const page=await load();
 for(const host of ['web.housemysite.com','hqproject.com']){
  state.host=host;state.profile={id:'member-fixture',role:'member'};state.customer=false;state.reads=0;
  const result=await page();assert(result);assert.equal(state.reads,1,'member dashboard must load rather than redirect to customer portal');
  state.profile={id:'admin-fixture',role:'admin'};state.reads=0;
  await assert.rejects(page(),{message:'redirect:'+(host==='web.housemysite.com'?'/hosting':'/admin')});assert.equal(state.reads,0);
  state.customer=true;await assert.rejects(page(),{message:'redirect:/client'});assert.equal(state.reads,0);state.customer=false;
 }
});
