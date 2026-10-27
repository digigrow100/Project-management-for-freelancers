const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

function fixture(){
 const state={reads:[],requests:[],writes:[],failed:false,project:'project-a',name:'A'};
 const db={from(table){const row={table,operation:'read',filters:[]};
  const query={select(fields){row.fields=fields;return query},eq(column,value){row.filters.push([column,value]);return query},gte(){return query},lt(){return query},order(){return query},range(){return query},is(){return query},upsert(values){row.operation='upsert';row.values=values;return query},update(values){row.operation='update';row.values=values;return query},insert(values){row.operation='insert';row.values=values;return query},then(ok,fail){
   if(row.operation!=='read'){state.writes.push(row);return Promise.resolve({data:null,error:null}).then(ok,fail);}
   state.reads.push(table);state.requests.push(row);
   let data=table.endsWith('project_domain_mappings')?[{id:'mapping',project_id:state.project,match_type:'domain',pattern:'example.test',label:'',is_active:true}]:[{id:state.project,name:state.name,website_url:'https://example.test'}];
   if(table.endsWith('profiles'))data=[{id:'employee-a',name:'A',email:'a@example.test'},{id:'employee-b',name:'B',email:'b@example.test'}];
   else if(!table.endsWith('project_domain_mappings')&&!table.endsWith('projects'))data=[];
   data=data.filter(item=>row.filters.every(([column,value])=>!(column in item)||item[column]===value));
   return Promise.resolve({data,error:state.failed?Error('database unavailable'):null}).then(ok,fail);
  }};return query;
 }};
 const output={exports:{}};
 const source=ts.transpileModule(fs.readFileSync('lib/employeeActivity.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(source,{module:output,exports:output.exports,URL,Date,Buffer,process,require(name){
  if(name==='./supabaseClient')return {getSupabase:()=>db};
  if(name==='./activityIntervals')return {confirmedActivityTime:()=>({seconds:0,byProject:{}})};
  if(name==='./activityPagination')return {readAllActivityRows:async fetchPage=>fetchPage(0,499)};
  if(name==='./extensionAvailability')return {};
  return require(name);
 }});
 return {...output.exports,state};
}
const device={id:'device-a',employeeId:'employee-a'};
function events(count){return Array.from({length:count},(_,i)=>({activityType:'active',url:'https://example.test/page-'+i,startedAt:new Date(1700000000000+i*1000).toISOString(),durationSeconds:1}));}

test('100-event upload uses two matcher reads and preserves every classified row',async()=>{
 const f=fixture();const result=await f.ingestActivityBatch(device,events(100));
 assert.equal(result.inserted,100);assert.equal(f.state.reads.length,2);
 const rows=f.state.writes.find(x=>x.table.endsWith('activity_logs')).values;
 assert.equal(rows.length,100);assert.ok(rows.every(r=>r.project_id==='project-a'&&r.employee_id==='employee-a'&&r.device_id==='device-a'));
});
test('matcher definitions refresh on the next request; no successful snapshot escapes its batch',async()=>{
 const f=fixture();await f.ingestActivityBatch(device,events(2));
 f.state.project='project-b';f.state.name='B';await f.ingestActivityBatch(device,events(2));
 assert.equal(f.state.reads.length,4);
 const batches=f.state.writes.filter(x=>x.table.endsWith('activity_logs'));
 assert.equal(batches[0].values[0].project_id,'project-a');assert.equal(batches[1].values[0].project_id,'project-b');
});
test('20-prompt upload shares only its local matcher snapshot and retains prompt records',async()=>{
 const f=fixture();const result=await f.ingestPromptBatch(device,Array.from({length:20},()=>({platform:'chatgpt',promptText:'Update example.test',submittedAt:new Date().toISOString()})));
 assert.equal(result.inserted,20);assert.equal(f.state.reads.length,2);
 assert.ok(f.state.writes[0].values.every(r=>r.project_id==='project-a'));
});
test('empty input avoids lookup and a failed lookup cannot use prior request data or write partial activity',async()=>{
 const f=fixture();await f.ingestActivityBatch(device,[]);await f.matchProjectForUrl('');assert.equal(f.state.reads.length,0);
 await f.ingestActivityBatch(device,events(1));f.state.failed=true;const writes=f.state.writes.length;
 await assert.rejects(f.ingestActivityBatch(device,events(1)),/database unavailable/);assert.equal(f.state.writes.length,writes);
 f.state.failed=false;f.state.project='project-c';assert.equal((await f.matchProjectForUrl('https://example.test')).id,'project-c');
});

test('personal summary scopes every employee-bearing query and admin overview keeps both profiles',async()=>{
 const f=fixture();const summary=await f.getEmployeeActivitySummary('employee-a');assert.equal(summary.employeeId,'employee-a');
 for(const suffix of ['profiles','employee_devices','activity_logs','ai_prompt_logs','browser_sessions']){
  const row=f.state.requests.find(q=>q.table.endsWith(suffix));assert.ok(row,suffix);
  assert.ok(row.filters.some(([key,value])=>key===(suffix==='profiles'?'id':'employee_id')&&value==='employee-a'),suffix);
 }
 assert.notEqual(f.state.requests.find(q=>q.table.endsWith('employee_devices')).fields,'*');
 const team=fixture();assert.equal((await team.getEmployeeActivitySummaries()).length,2);
});
